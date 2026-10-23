-- Run once in Supabase -> SQL Editor (after migrate-001.sql and migrate-002.sql).
-- Plant dispatch: after the DO the plant dispatches each line, part quantities allowed, until the
-- whole DO has gone out. Adds the plant role, line plant status, the dispatch log, short close and
-- the order timeline. (A fresh install from the current schema.sql already includes all of this.)

alter table profiles drop constraint profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('admin', 'sales', 'approver', 'operations', 'accounts', 'plant'));

-- Plant status per line replaces Not Ready / Ready for Production (which used to gate the DO).
alter table order_items drop constraint order_items_production_status_check;
update order_items set production_status = 'Pending';
alter table order_items alter column production_status set default 'Pending';
alter table order_items add constraint order_items_production_status_check
  check (production_status in ('Pending', 'Under Production', 'Coil N/A'));
-- delivered_qty is the quantity on the DO; dispatched_qty is how much of it the plant has sent.
alter table order_items add column coil_date date, add column dispatched_qty numeric not null default 0;
alter table order_items add column balance_qty numeric
  generated always as (coalesce(delivered_qty, 0) - dispatched_qty) stored;

-- Set by generate_do and kept in step by refresh_dispatch_status(); null until there is a DO.
alter table orders
  add column dispatch_status text check (dispatch_status in ('PENDING', 'PARTIAL', 'DISPATCHED', 'SHORT_CLOSED')),
  add column short_close_reason text;
update orders set dispatch_status = 'PENDING' where do_date is not null;

-- One row per line per dispatch; the truck details repeat on each line of the same dispatch.
create table dispatches (
  id            bigint generated always as identity primary key,
  order_id      bigint not null references orders on delete cascade,
  order_item_id bigint not null references order_items on delete cascade,
  qty           numeric not null check (qty > 0),
  dispatch_date date not null,
  vehicle_no    text,
  transporter   text,
  lr_no         text,
  driver        text,
  by_name       text,
  created_at    timestamptz not null default now()
);
create index on dispatches (order_id);

-- Order timeline: who did what and when.
create table order_events (
  id       bigint generated always as identity primary key,
  order_id bigint not null references orders on delete cascade,
  at       timestamptz not null default now(),
  by_name  text,
  action   text not null,
  detail   text
);
create index on order_events (order_id);

-- Timeline for orders that already exist, from what the order row recorded.
insert into order_events (order_id, at, by_name, action)
  select o.id, o.created_at, coalesce(p.full_name, o.salesperson_name), 'Quotation created'
    from orders o left join profiles p on p.id = o.created_by;
insert into order_events (order_id, at, by_name, action, detail)
  select id, action_at, action_by, initcap(status), reject_reason from orders where action_at is not null;
insert into order_events (order_id, at, by_name, action, detail)
  select id, do_date::timestamp at time zone 'Asia/Riyadh', do_by, 'DO generated', doc_no from orders where do_date is not null;
insert into order_events (order_id, at, by_name, action, detail)
  select id, pi_date::timestamp at time zone 'Asia/Riyadh', pi_by, 'PI generated', doc_no from orders where pi_date is not null;

alter table dispatches   enable row level security;
alter table order_events enable row level security;

-- PENDING -> PARTIAL -> DISPATCHED from the lines; SHORT_CLOSED stays as it is.
create or replace function refresh_dispatch_status(p_order bigint) returns text language sql as $$
  update orders o set dispatch_status = case
      when o.dispatch_status = 'SHORT_CLOSED' then 'SHORT_CLOSED'
      when s.left_qty <= 0 then 'DISPATCHED'
      when s.done > 0 then 'PARTIAL'
      else 'PENDING' end
    from (select coalesce(sum(balance_qty), 0) as left_qty, coalesce(sum(dispatched_qty), 0) as done
            from order_items where order_id = p_order) s
   where o.id = p_order
  returning o.dispatch_status
$$;

create or replace function generate_do(p_order bigint, p_lines jsonb, p_by text) returns text language plpgsql as $$
begin
  update orders set do_date = (now() at time zone 'Asia/Riyadh')::date, do_by = p_by, dispatch_status = 'PENDING'
   where id = p_order and status = 'APPROVED' and do_date is null;
  if not found then raise exception 'A Delivery Order already exists, or the order is not approved.'; end if;
  update order_items i set delivered_qty = (l->>'qty')::numeric, delivered_m2 = (l->>'m2')::numeric
    from jsonb_array_elements(p_lines) l
   where i.id = (l->>'id')::bigint and i.order_id = p_order;
  return assign_doc_no(p_order);
end $$;

-- p_lines: [{"id": 1, "qty": 10}, ...]
-- p_info:  {"date": "2026-10-23", "vehicle_no": "", "transporter": "", "lr_no": "", "driver": ""}
create or replace function record_dispatch(p_order bigint, p_lines jsonb, p_info jsonb, p_by text) returns text language plpgsql as $$
declare
  v_bad int;
begin
  -- Locks the order, so two dispatches of the same order can't both take the last of a balance.
  perform 1 from orders where id = p_order and status = 'APPROVED' and dispatch_status in ('PENDING', 'PARTIAL') for update;
  if not found then raise exception 'This order is not open for dispatch.'; end if;
  select count(*) into v_bad
    from jsonb_array_elements(p_lines) l
    left join order_items i on i.id = (l->>'id')::bigint and i.order_id = p_order
   where i.id is null or (l->>'qty')::numeric <= 0 or (l->>'qty')::numeric > i.balance_qty;
  if v_bad > 0 then raise exception 'A dispatch quantity is more than the balance left on the DO - refresh and try again.'; end if;
  update order_items i set dispatched_qty = i.dispatched_qty + (l->>'qty')::numeric
    from jsonb_array_elements(p_lines) l
   where i.id = (l->>'id')::bigint;
  insert into dispatches (order_id, order_item_id, qty, dispatch_date, vehicle_no, transporter, lr_no, driver, by_name)
    select p_order, (l->>'id')::bigint, (l->>'qty')::numeric, (p_info->>'date')::date,
           nullif(p_info->>'vehicle_no', ''), nullif(p_info->>'transporter', ''),
           nullif(p_info->>'lr_no', ''), nullif(p_info->>'driver', ''), p_by
      from jsonb_array_elements(p_lines) l;
  return refresh_dispatch_status(p_order);
end $$;

-- Takes one dispatch row back off its line (e.g. entered by mistake).
create or replace function undo_dispatch(p_dispatch bigint) returns text language plpgsql as $$
declare
  v_order bigint;
  v_item  bigint;
  v_qty   numeric;
begin
  select order_id into v_order from dispatches where id = p_dispatch;
  if v_order is null then raise exception 'That dispatch was already undone.'; end if;
  perform 1 from orders where id = v_order for update;
  delete from dispatches where id = p_dispatch returning order_item_id, qty into v_item, v_qty;
  if v_item is null then raise exception 'That dispatch was already undone.'; end if;
  update order_items set dispatched_qty = dispatched_qty - v_qty where id = v_item;
  return refresh_dispatch_status(v_order);
end $$;

revoke execute on function refresh_dispatch_status(bigint)             from public, anon, authenticated;
revoke execute on function generate_do(bigint, jsonb, text)            from public, anon, authenticated;
revoke execute on function record_dispatch(bigint, jsonb, jsonb, text) from public, anon, authenticated;
revoke execute on function undo_dispatch(bigint)                       from public, anon, authenticated;
