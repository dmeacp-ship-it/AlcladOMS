-- ==============================================================================
-- migrate-004: Multi-Batch Delivery Order (DO) and Proforma Invoice (PI)
-- Run this in Supabase -> SQL Editor.
-- ==============================================================================

-- 1. New tables for Batches
create table if not exists order_batches (
  id            bigint generated always as identity primary key,
  order_id      bigint not null references orders on delete cascade,
  batch_no      int not null default 1,
  do_no         text unique,            -- e.g. DO-CUS-001-23/10/26-01
  pi_no         text unique,            -- e.g. PI-CUS-001-23/10/26-01
  do_date       date,
  pi_date       date,
  do_by         text,
  pi_by         text,
  price_note    text,
  dispatch_date date,
  vehicle_no    text,
  transporter   text,
  lr_no         text,
  driver        text,
  transport     numeric(12, 2) not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists idx_order_batches_order on order_batches (order_id);

create table if not exists batch_items (
  id             bigint generated always as identity primary key,
  batch_id       bigint not null references order_batches on delete cascade,
  order_item_id  bigint not null references order_items on delete cascade,
  do_qty         numeric not null default 0,
  do_m2          numeric not null default 0,
  invoiced_qty   numeric,
  invoiced_m2    numeric,
  invoiced_price numeric,
  invoiced_total numeric
);
create index if not exists idx_batch_items_batch on batch_items (batch_id);
create index if not exists idx_batch_items_item on batch_items (order_item_id);

-- 2. Add ready_qty and ready_at to order_items
alter table order_items add column if not exists ready_qty numeric default 0;
alter table order_items add column if not exists ready_at  timestamptz;

-- 2b. Allow 'Ready for Dispatch' in production_status check constraint
alter table order_items drop constraint if exists order_items_production_status_check;
alter table order_items add constraint order_items_production_status_check
  check (production_status in ('Pending', 'Under Production', 'Ready for Dispatch', 'Coil N/A'));

-- 3. Update balance_qty to calculate from ordered qty - dispatched_qty
alter table order_items drop column if exists balance_qty;
alter table order_items add column balance_qty numeric generated always as (qty - coalesce(dispatched_qty, 0)) stored;

-- 4. Enable RLS
alter table order_batches enable row level security;
alter table batch_items   enable row level security;

-- 5. Helper function: assign_batch_no
create or replace function assign_batch_no(p_batch bigint, p_kind text) returns text language plpgsql as $$
declare
  v_no     text;
  v_code   text;
  v_prefix text;
  v_seq    int;
  v_date_str text;
begin
  perform pg_advisory_xact_lock(hashtext('batch_no'));

  -- Check existing number
  if p_kind = 'DO' then
    select do_no into v_no from order_batches where id = p_batch;
    if v_no is not null then return v_no; end if;
  elsif p_kind = 'PI' then
    select pi_no into v_no from order_batches where id = p_batch;
    if v_no is not null then return v_no; end if;
  else
    raise exception 'p_kind must be DO or PI';
  end if;

  -- Get customer code
  select coalesce(o.customer_code, 'CUS') into v_code
    from orders o
    join order_batches b on b.order_id = o.id
   where b.id = p_batch;

  v_date_str := to_char(now() at time zone 'Asia/Riyadh', 'DD/MM/YY');
  v_prefix := p_kind || '-' || v_code || '-' || v_date_str || '-';

  if p_kind = 'DO' then
    select coalesce(max(substring(do_no from length(v_prefix) + 1)::int), 0) + 1 into v_seq
      from order_batches
     where left(do_no, length(v_prefix)) = v_prefix;
    v_no := v_prefix || lpad(v_seq::text, 2, '0');
    update order_batches set do_no = v_no where id = p_batch;
  else
    -- For PI, check if there is a matching sequence from the batch's DO or next available PI of that day
    select coalesce(max(substring(pi_no from length(v_prefix) + 1)::int), 0) + 1 into v_seq
      from order_batches
     where left(pi_no, length(v_prefix)) = v_prefix;
    v_no := v_prefix || lpad(v_seq::text, 2, '0');
    update order_batches set pi_no = v_no where id = p_batch;
  end if;

  return v_no;
end $$;

-- 6. RPC: mark_ready
create or replace function mark_ready(p_order bigint, p_lines jsonb, p_by text) returns void language plpgsql as $$
begin
  perform 1 from orders where id = p_order and status = 'APPROVED' for update;
  if not found then raise exception 'Order is not approved.'; end if;
  update order_items i
     set ready_qty = coalesce((l->>'ready_qty')::numeric, 0),
         ready_at  = now()
    from jsonb_array_elements(p_lines) l
   where i.id = (l->>'id')::bigint and i.order_id = p_order;
end $$;

-- 7. RPC: generate_batch_do
create or replace function generate_batch_do(p_order bigint, p_lines jsonb, p_info jsonb, p_by text) returns text language plpgsql as $$
declare
  v_batch bigint;
  v_batch_no int;
  v_do_no text;
  v_today date := (now() at time zone 'Asia/Riyadh')::date;
begin
  perform 1 from orders where id = p_order and status = 'APPROVED' for update;
  if not found then raise exception 'Order is not approved.'; end if;

  select coalesce(max(batch_no), 0) + 1 into v_batch_no
    from order_batches where order_id = p_order;

  insert into order_batches (order_id, batch_no, do_date, do_by, dispatch_date,
                              vehicle_no, transporter, lr_no, driver, transport)
  values (p_order, v_batch_no,
          v_today, p_by,
          coalesce((p_info->>'date')::date, v_today),
          nullif(p_info->>'vehicle_no', ''), nullif(p_info->>'transporter', ''),
          nullif(p_info->>'lr_no', ''), nullif(p_info->>'driver', ''),
          coalesce((p_info->>'transport')::numeric, 0))
  returning id into v_batch;

  -- Insert batch items
  insert into batch_items (batch_id, order_item_id, do_qty, do_m2)
    select v_batch, (l->>'id')::bigint, (l->>'qty')::numeric, (l->>'m2')::numeric
      from jsonb_array_elements(p_lines) l
     where (l->>'qty')::numeric > 0;

  -- Update order_items: dispatched_qty increases, ready_qty is consumed
  update order_items i
     set dispatched_qty = coalesce(i.dispatched_qty, 0) + (l->>'qty')::numeric,
         ready_qty      = greatest(coalesce(i.ready_qty, 0) - (l->>'qty')::numeric, 0)
    from jsonb_array_elements(p_lines) l
   where i.id = (l->>'id')::bigint and (l->>'qty')::numeric > 0;

  -- Record into dispatches table
  insert into dispatches (order_id, order_item_id, qty, dispatch_date,
                          vehicle_no, transporter, lr_no, driver, by_name)
    select p_order, (l->>'id')::bigint, (l->>'qty')::numeric,
           coalesce((p_info->>'date')::date, v_today),
           nullif(p_info->>'vehicle_no', ''), nullif(p_info->>'transporter', ''),
           nullif(p_info->>'lr_no', ''), nullif(p_info->>'driver', ''), p_by
      from jsonb_array_elements(p_lines) l
     where (l->>'qty')::numeric > 0;

  -- Assign DO doc_no
  v_do_no := assign_batch_no(v_batch, 'DO');

  -- Update order header
  update orders
     set do_date = coalesce(do_date, v_today),
         doc_no = coalesce(doc_no, v_do_no),
         do_by = coalesce(do_by, p_by),
         dispatch_status = case
           when (select coalesce(sum(qty - dispatched_qty), 0) from order_items where order_id = p_order) <= 0 then 'DISPATCHED'
           else 'PARTIAL' end
   where id = p_order;

  return v_do_no;
end $$;

-- 8. RPC: generate_batch_pi
create or replace function generate_batch_pi(p_batch bigint, p_lines jsonb, p_by text, p_note text) returns text language plpgsql as $$
declare
  v_order bigint;
  v_pi_no text;
  v_today date := (now() at time zone 'Asia/Riyadh')::date;
begin
  select order_id into v_order from order_batches where id = p_batch;
  if v_order is null then raise exception 'Batch not found.'; end if;

  perform 1 from orders where id = v_order and status = 'APPROVED' for update;
  if not found then raise exception 'Order is not approved.'; end if;

  update order_batches
     set pi_date = v_today,
         pi_by   = p_by,
         price_note = nullif(p_note, '')
   where id = p_batch and pi_date is null;

  -- Update batch_items
  update batch_items bi
     set invoiced_qty   = (l->>'qty')::numeric,
         invoiced_m2    = (l->>'m2')::numeric,
         invoiced_price = (l->>'price')::numeric,
         invoiced_total = (l->>'total')::numeric
    from jsonb_array_elements(p_lines) l
   where bi.batch_id = p_batch
     and bi.order_item_id = (l->>'order_item_id')::bigint;

  v_pi_no := assign_batch_no(p_batch, 'PI');

  -- Update order header if first PI
  update orders
     set pi_date = coalesce(pi_date, v_today),
         pi_by = coalesce(pi_by, p_by)
   where id = v_order;

  return v_pi_no;
end $$;

revoke execute on function assign_batch_no(bigint, text)                 from public, anon, authenticated;
revoke execute on function mark_ready(bigint, jsonb, text)               from public, anon, authenticated;
revoke execute on function generate_batch_do(bigint, jsonb, jsonb, text) from public, anon, authenticated;
revoke execute on function generate_batch_pi(bigint, jsonb, text, text)  from public, anon, authenticated;
