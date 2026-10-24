-- TAS OMS schema. Paste into Supabase -> SQL Editor and run once, then run seed.sql.
-- All access goes through the Next.js server with the service role key, so every
-- table has RLS on with no policies: the anon / authenticated roles see nothing.

create table profiles (
  id         uuid primary key references auth.users on delete cascade,
  full_name  text not null,
  email      text,
  username   text unique check (username ~ '^[a-z0-9._-]{3,30}$'), -- optional sign-in name

  mobile     text,
  role       text not null check (role in ('admin', 'manager', 'sales', 'approver', 'operations', 'accounts', 'plant')),
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create table customers (
  id      bigint generated always as identity primary key,
  code    text not null unique,
  name    text not null unique,
  type    text,
  country text,
  address text,
  cr_no   text,
  vat_no  text,
  mobile  text,
  email   text
);

create table items (
  id          bigint generated always as identity primary key,
  brand       text,
  color_code  text,
  color_name  text,
  grade       text,
  core        text,
  skin        numeric,
  width       numeric,
  length      numeric,
  thickness   numeric,
  uom         text default 'M2',
  description text
);

-- Q-YYYY-NNN, restarting every year. The lock is held until the inserting
-- transaction commits, so two simultaneous quotes never get the same number.
create function next_quote_no() returns text language plpgsql as $$
declare
  y text := to_char(now() at time zone 'Asia/Riyadh', 'YYYY');
  n int;
begin
  perform pg_advisory_xact_lock(hashtext('quote_no'));
  select coalesce(max(split_part(quote_no, '-', 3)::int), 0) + 1 into n
    from orders where quote_no like 'Q-' || y || '-%';
  return 'Q-' || y || '-' || lpad(n::text, 3, '0');
end $$;

create table orders (
  id               bigint generated always as identity primary key,
  quote_no         text not null unique default next_quote_no(),
  quote_date       date not null default (now() at time zone 'Asia/Riyadh')::date,
  customer_id      bigint references customers on delete set null,
  -- customer snapshot, so documents never change when the master is edited
  customer_code    text,
  customer_name    text not null,
  address          text,
  cr_no            text,
  vat_no           text,
  contact_no       text,
  salesperson_id   uuid references profiles,
  salesperson_name text,
  notes            text,
  transport        numeric(12, 2) not null default 0,
  status           text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
  action_by        text,
  action_at        timestamptz,
  reject_reason    text,
  doc_no           text unique,   -- shared by the Delivery Order and the Proforma Invoice
  do_date          date,
  pi_date          date,
  do_by            text,
  pi_by            text,
  price_note       text,          -- why PI prices differ from the approved quote
  -- PENDING / PARTIAL / DISPATCHED / SHORT_CLOSED: set by generate_do, kept in step by refresh_dispatch_status()
  dispatch_status  text check (dispatch_status in ('PENDING', 'PARTIAL', 'DISPATCHED', 'SHORT_CLOSED')),
  short_close_reason text,
  tax_invoice_path text,
  created_by       uuid references profiles,
  created_at       timestamptz not null default now()
);

create table order_items (
  id                bigint generated always as identity primary key,
  order_id          bigint not null references orders on delete cascade,
  item_no           int not null,
  brand             text,
  color_code        text,
  color_name        text,
  grade             text,
  core              text,
  skin              numeric,
  width             numeric,
  length            numeric,
  thickness         numeric,
  uom               text not null default 'M2',
  description       text not null,
  qty               numeric not null check (qty > 0),
  m2                numeric not null,
  price             numeric not null check (price >= 0),
  total             numeric not null,
  -- plant status of the line; coil_date only while it is 'Coil N/A'
  production_status text not null default 'Pending'
                    check (production_status in ('Pending', 'Under Production', 'Coil N/A')),
  coil_date         date,
  delivered_qty     numeric,       -- quantity on the DO
  delivered_m2      numeric,
  invoiced_qty      numeric,
  invoiced_m2       numeric,
  invoiced_price    numeric,
  invoiced_total    numeric,
  dispatched_qty    numeric not null default 0,   -- how much of the DO the plant has sent
  balance_qty       numeric generated always as (coalesce(delivered_qty, 0) - dispatched_qty) stored
);
create index on order_items (order_id);
create index on orders (salesperson_id);

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

-- CUSTCODE-DD/MM/YY-NN, per customer per day. Whichever of DO / PI comes first
-- assigns it; the other reuses it (same as the Google Sheet version).
create function assign_doc_no(p_order bigint) returns text language plpgsql as $$
declare
  v_no     text;
  v_code   text;
  v_prefix text;
  v_seq    int;
begin
  perform pg_advisory_xact_lock(hashtext('doc_no'));
  select doc_no, customer_code into v_no, v_code from orders where id = p_order;
  if v_no is not null then return v_no; end if;
  if coalesce(v_code, '') = '' then
    raise exception 'This order has no customer code - set one under Customers and recreate the quote.';
  end if;
  v_prefix := v_code || '-' || to_char(now() at time zone 'Asia/Riyadh', 'DD/MM/YY') || '-';
  select coalesce(max(substring(doc_no from length(v_prefix) + 1)::int), 0) + 1 into v_seq
    from orders where left(doc_no, length(v_prefix)) = v_prefix;
  v_no := v_prefix || lpad(v_seq::text, 2, '0');
  update orders set doc_no = v_no where id = p_order;
  return v_no;
end $$;

-- DO and PI are each one transaction: header, every line and the number, or nothing. DO comes first.
-- p_lines: [{"id": 1, "qty": 10, "m2": 2.5}, ...]
create function generate_do(p_order bigint, p_lines jsonb, p_by text) returns text language plpgsql as $$
begin
  update orders set do_date = (now() at time zone 'Asia/Riyadh')::date, do_by = p_by, dispatch_status = 'PENDING'
   where id = p_order and status = 'APPROVED' and do_date is null;
  if not found then raise exception 'A Delivery Order already exists, or the order is not approved.'; end if;
  update order_items i set delivered_qty = (l->>'qty')::numeric, delivered_m2 = (l->>'m2')::numeric
    from jsonb_array_elements(p_lines) l
   where i.id = (l->>'id')::bigint and i.order_id = p_order;
  return assign_doc_no(p_order);
end $$;

-- p_lines: [{"id": 1, "qty": 10, "m2": 2.5, "price": 40, "total": 100}, ...]
create function generate_pi(p_order bigint, p_lines jsonb, p_by text, p_note text) returns text language plpgsql as $$
begin
  update orders set pi_date = (now() at time zone 'Asia/Riyadh')::date, pi_by = p_by, price_note = p_note
   where id = p_order and status = 'APPROVED' and pi_date is null and do_date is not null;
  if not found then raise exception 'A Proforma Invoice already exists, or the order has no Delivery Order yet.'; end if;
  update order_items i set invoiced_qty = (l->>'qty')::numeric, invoiced_m2 = (l->>'m2')::numeric,
         invoiced_price = (l->>'price')::numeric, invoiced_total = (l->>'total')::numeric
    from jsonb_array_elements(p_lines) l
   where i.id = (l->>'id')::bigint and i.order_id = p_order;
  return assign_doc_no(p_order);
end $$;

-- PENDING -> PARTIAL -> DISPATCHED from the lines; SHORT_CLOSED stays as it is.
create function refresh_dispatch_status(p_order bigint) returns text language sql as $$
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

-- p_lines: [{"id": 1, "qty": 10}, ...]
-- p_info:  {"date": "2026-10-23", "vehicle_no": "", "transporter": "", "lr_no": "", "driver": ""}
create function record_dispatch(p_order bigint, p_lines jsonb, p_info jsonb, p_by text) returns text language plpgsql as $$
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
create function undo_dispatch(p_dispatch bigint) returns text language plpgsql as $$
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

-- Distinct values for the quotation form's pick-lists (one call instead of 3800 rows).
create function item_options() returns json language sql stable as $$
  select json_build_object(
    'brand',     (select json_agg(distinct brand)     from items where brand is not null),
    'grade',     (select json_agg(distinct grade)     from items where grade is not null),
    'core',      (select json_agg(distinct core)      from items where core is not null),
    'skin',      (select json_agg(distinct skin)      from items where skin is not null),
    'width',     (select json_agg(distinct width)     from items where width is not null),
    'length',    (select json_agg(distinct length)    from items where length is not null),
    'thickness', (select json_agg(distinct thickness) from items where thickness is not null),
    'color',     (select json_object_agg(color_code, color_name) from
                   (select distinct on (color_code) color_code, color_name from items
                     where color_code is not null order by color_code) c)
  )
$$;

alter table profiles    enable row level security;
alter table customers   enable row level security;
alter table items       enable row level security;
alter table orders      enable row level security;
alter table order_items enable row level security;
alter table dispatches   enable row level security;
alter table order_events enable row level security;

revoke execute on function next_quote_no()       from public, anon, authenticated;
revoke execute on function assign_doc_no(bigint) from public, anon, authenticated;
revoke execute on function generate_do(bigint, jsonb, text) from public, anon, authenticated;
revoke execute on function generate_pi(bigint, jsonb, text, text) from public, anon, authenticated;
revoke execute on function item_options()        from public, anon, authenticated;
revoke execute on function refresh_dispatch_status(bigint) from public, anon, authenticated;
revoke execute on function record_dispatch(bigint, jsonb, jsonb, text) from public, anon, authenticated;
revoke execute on function undo_dispatch(bigint) from public, anon, authenticated;

-- Private bucket for uploaded tax invoices (served through short-lived signed URLs).
insert into storage.buckets (id, name, public) values ('tax-invoices', 'tax-invoices', false)
on conflict (id) do nothing;
