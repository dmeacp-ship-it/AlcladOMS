-- migrate-015: Inventory, phase 1 (27 Oct 2026). Run in Supabase -> SQL Editor.
-- Masters: plants, stores, materials, vendors. Flow: PO (approved by admin) -> GRN -> incoming QC -> store;
-- issue / transfer between stores; opening stock and adjustments. Every change of stock is one row in
-- stock_moves (+ in, - out); stock = the sum of those rows, so there are no running totals to keep in step.

create table plants (
  id      bigint generated always as identity primary key,
  code    text not null unique,
  name    text not null,
  address text
);

-- type GRANULE is there for the granules plant later; no screen uses it yet.
create table stores (
  id         bigint generated always as identity primary key,
  plant_code text not null references plants (code) on update cascade,
  code       text not null unique,
  name       text not null,
  type       text not null default 'RM' check (type in ('RM', 'WIP', 'FG', 'SCRAP', 'GRANULE'))
);

create table materials (
  id        bigint generated always as identity primary key,
  code      text not null unique,
  name      text not null,
  category  text not null default 'RM' check (category in ('RM', 'CONSUMABLE', 'GRANULE', 'SCRAP')),
  mat_type  text,                -- PE, PVDF, 2PE, SDP…
  thickness numeric,
  width     numeric,
  uom       text not null default 'KG',
  min_level numeric,             -- below this the stock report shows the row red
  max_level numeric
);

create table vendors (
  id      bigint generated always as identity primary key,
  code    text not null unique,
  name    text not null unique,
  vat_no  text,
  mobile  text,
  email   text,
  address text
);

-- PO-2026-001, GRN-2026-001, ISS-2026-001, ADJ-2026-001: one counter per kind and year (Riyadh time).
create table inv_counters (
  kind text not null,
  yr   int  not null,
  n    int  not null,
  primary key (kind, yr)
);
create function next_inv_no(p_kind text) returns text language sql as $$
  insert into inv_counters values (p_kind, extract(year from now() at time zone 'Asia/Riyadh')::int, 1)
  on conflict (kind, yr) do update set n = inv_counters.n + 1
  returning kind || '-' || yr || '-' || lpad(n::text, 3, '0')
$$;

create table purchase_orders (
  id            bigint generated always as identity primary key,
  po_no         text not null unique default next_inv_no('PO'),
  po_date       date not null default (now() at time zone 'Asia/Riyadh')::date,
  plant_code    text not null references plants (code) on update cascade,
  vendor_id     bigint references vendors on delete set null,
  vendor_name   text not null,
  status        text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED', 'CLOSED')),
  notes         text,
  created_by    text,
  action_by     text,               -- who approved / rejected / closed it
  action_at     timestamptz,
  reason        text,               -- why it was rejected or closed early
  created_at    timestamptz not null default now()
);

-- received_qty = what came in and passed QC, plus what is still waiting for QC.
create table po_items (
  id           bigint generated always as identity primary key,
  po_id        bigint not null references purchase_orders on delete cascade,
  line_no      int not null,
  material_id  bigint not null references materials,
  qty          numeric not null check (qty > 0),
  rate         numeric not null default 0 check (rate >= 0),
  received_qty numeric not null default 0,
  pending_qty  numeric generated always as (qty - received_qty) stored
);
create index on po_items (po_id);

create table grns (
  id         bigint generated always as identity primary key,
  grn_no     text not null unique default next_inv_no('GRN'),
  grn_date   date not null,
  po_id      bigint not null references purchase_orders,
  store_id   bigint not null references stores,
  invoice_no text,
  status     text not null default 'QC_PENDING' check (status in ('QC_PENDING', 'DONE')),
  notes      text,
  by_name    text,
  qc_by      text,
  qc_at      timestamptz,
  created_at timestamptz not null default now()
);
create index on grns (po_id);

create table grn_items (
  id           bigint generated always as identity primary key,
  grn_id       bigint not null references grns on delete cascade,
  po_item_id   bigint not null references po_items,
  material_id  bigint not null references materials,
  qty          numeric not null check (qty > 0),  -- received
  accepted_qty numeric,                           -- set by QC
  rejected_qty numeric,
  qc_remarks   text
);
create index on grn_items (grn_id);

-- Issue to a production line (a WIP store) or move between any two stores.
create table transfers (
  id            bigint generated always as identity primary key,
  doc_no        text not null unique default next_inv_no('ISS'),
  doc_date      date not null,
  from_store_id bigint not null references stores,
  to_store_id   bigint not null references stores,
  requested_by  text,
  notes         text,
  by_name       text,
  created_at    timestamptz not null default now(),
  check (from_store_id <> to_store_id)
);
create table transfer_items (
  id          bigint generated always as identity primary key,
  transfer_id bigint not null references transfers on delete cascade,
  material_id bigint not null references materials,
  qty         numeric not null check (qty > 0)
);
create index on transfer_items (transfer_id);

create table stock_moves (
  id          bigint generated always as identity primary key,
  move_date   date not null,
  store_id    bigint not null references stores,
  material_id bigint not null references materials,
  qty         numeric not null check (qty <> 0),
  ref_type    text not null check (ref_type in ('OPENING', 'ADJUST', 'GRN', 'ISSUE')),
  ref_no      text,
  note        text,
  by_name     text,
  created_at  timestamptz not null default now()
);
create index on stock_moves (store_id, material_id);
create index on stock_moves (move_date);

alter table plants          enable row level security;
alter table stores          enable row level security;
alter table materials       enable row level security;
alter table vendors         enable row level security;
alter table inv_counters    enable row level security;
alter table purchase_orders enable row level security;
alter table po_items        enable row level security;
alter table grns            enable row level security;
alter table grn_items       enable row level security;
alter table transfers       enable row level security;
alter table transfer_items  enable row level security;
alter table stock_moves     enable row level security;

-- Every function that takes stock out holds this lock, so two issues can't both take the last of a material.
-- ponytail: one lock for all stock; lock per store + material if many people post at the same moment.
create function lock_stock() returns void language sql as $$ select pg_advisory_xact_lock(hashtext('stock')) $$;

-- Raises if any store + material in p_moves ends up below zero (run after inserting the moves).
-- (Same as migrate-016, which gives databases that ran the first version of this file the clearer message.)
create or replace function check_stock(p_keys jsonb) returns void language plpgsql as $$
declare
  v_mat text;
  v_store text;
  v_uom text;
  v_qty numeric;
begin
  select m.code, s.name, m.uom, t.q into v_mat, v_store, v_uom, v_qty
    from (select v.store_id, v.material_id, sum(v.qty) q
            from stock_moves v
           where (v.store_id, v.material_id) in (select (k->>'store')::bigint, (k->>'material')::bigint from jsonb_array_elements(p_keys) k)
           group by 1, 2) t
    join materials m on m.id = t.material_id
    join stores s on s.id = t.store_id
   where t.q < 0
   limit 1;
  if v_mat is not null then
    raise exception 'Not enough % in %: % % short.', v_mat, v_store, trim_scale(round(-v_qty, 3)), v_uom;
  end if;
end $$;

-- p_head: { date, plant, vendor, notes, by }; p_lines: [{ material, qty, rate }]
create function create_po(p_head jsonb, p_lines jsonb) returns text language plpgsql as $$
declare
  v_id bigint;
  v_no text;
begin
  insert into purchase_orders (po_date, plant_code, vendor_id, vendor_name, notes, created_by)
  select (p_head->>'date')::date, p_head->>'plant', v.id, v.name, nullif(p_head->>'notes', ''), p_head->>'by'
    from vendors v where v.id = (p_head->>'vendor')::bigint
  returning id, po_no into v_id, v_no;
  if v_id is null then raise exception 'Pick a vendor.'; end if;
  insert into po_items (po_id, line_no, material_id, qty, rate)
  select v_id, n, (l->>'material')::bigint, (l->>'qty')::numeric, coalesce((l->>'rate')::numeric, 0)
    from jsonb_array_elements(p_lines) with ordinality as t (l, n);
  return v_no;
end $$;

-- Goods received against an approved PO; nothing reaches stock until QC (qc_grn).
-- A line may take up to 2% more than its PO quantity (weighed coils rarely match exactly).
-- p_head: { po, store, date, invoice_no, notes, by }; p_lines: [{ po_item, qty }]
create function create_grn(p_head jsonb, p_lines jsonb) returns text language plpgsql as $$
declare
  v_po purchase_orders;
  v_id bigint;
  v_no text;
  v_bad int;
begin
  select * into v_po from purchase_orders where id = (p_head->>'po')::bigint for update;
  if v_po.status is distinct from 'APPROVED' then raise exception 'Only an approved, open PO can be received.'; end if;
  perform 1 from stores where id = (p_head->>'store')::bigint and plant_code = v_po.plant_code;
  if not found then raise exception 'Pick a store of plant %.', v_po.plant_code; end if;
  select count(*) into v_bad
    from jsonb_array_elements(p_lines) l
    left join po_items i on i.id = (l->>'po_item')::bigint and i.po_id = v_po.id
   where i.id is null or (l->>'qty')::numeric <= 0 or i.received_qty + (l->>'qty')::numeric > i.qty * 1.02;
  if v_bad > 0 then raise exception 'A received quantity is more than 2%% over what is pending on the PO - refresh and try again.'; end if;
  insert into grns (grn_date, po_id, store_id, invoice_no, notes, by_name)
  values ((p_head->>'date')::date, v_po.id, (p_head->>'store')::bigint, nullif(p_head->>'invoice_no', ''), nullif(p_head->>'notes', ''), p_head->>'by')
  returning id, grn_no into v_id, v_no;
  insert into grn_items (grn_id, po_item_id, material_id, qty)
  select v_id, i.id, i.material_id, (l->>'qty')::numeric
    from jsonb_array_elements(p_lines) l join po_items i on i.id = (l->>'po_item')::bigint;
  update po_items i set received_qty = i.received_qty + (l->>'qty')::numeric
    from jsonb_array_elements(p_lines) l where i.id = (l->>'po_item')::bigint;
  return v_no;
end $$;

-- Incoming QC: accepted quantity goes into the GRN's store; rejected goes back on the PO as pending.
-- The PO closes by itself once every line is fully received and no GRN of it waits for QC.
-- p_lines: [{ id (grn_item), rejected, remarks }]
create function qc_grn(p_grn bigint, p_lines jsonb, p_by text) returns text language plpgsql as $$
declare
  v_g grns;
  v_bad int;
begin
  select * into v_g from grns where id = p_grn for update;
  if v_g.status is distinct from 'QC_PENDING' then raise exception 'This GRN has already been through QC.'; end if;
  select count(*) into v_bad
    from grn_items i
    left join jsonb_array_elements(p_lines) l on (l->>'id')::bigint = i.id
   where i.grn_id = p_grn
     and (l is null or coalesce((l->>'rejected')::numeric, 0) < 0 or coalesce((l->>'rejected')::numeric, 0) > i.qty);
  if v_bad > 0 then raise exception 'Rejected quantity must be between 0 and the received quantity on every line.'; end if;
  update grn_items i
     set rejected_qty = coalesce((l->>'rejected')::numeric, 0),
         accepted_qty = i.qty - coalesce((l->>'rejected')::numeric, 0),
         qc_remarks   = nullif(l->>'remarks', '')
    from jsonb_array_elements(p_lines) l
   where i.grn_id = p_grn and i.id = (l->>'id')::bigint;
  update po_items p set received_qty = p.received_qty - i.rejected_qty
    from grn_items i where i.grn_id = p_grn and i.po_item_id = p.id and i.rejected_qty > 0;
  insert into stock_moves (move_date, store_id, material_id, qty, ref_type, ref_no, by_name)
  select v_g.grn_date, v_g.store_id, i.material_id, i.accepted_qty, 'GRN', v_g.grn_no, p_by
    from grn_items i where i.grn_id = p_grn and i.accepted_qty > 0;
  update grns set status = 'DONE', qc_by = p_by, qc_at = now() where id = p_grn;
  update purchase_orders po set status = 'CLOSED', action_by = p_by, action_at = now(), reason = 'Fully received'
   where po.id = v_g.po_id and po.status = 'APPROVED'
     and not exists (select 1 from po_items i where i.po_id = po.id and i.pending_qty > 0)
     and not exists (select 1 from grns g where g.po_id = po.id and g.status = 'QC_PENDING');
  return v_g.grn_no;
end $$;

-- p_head: { from, to, date, requested_by, notes, by }; p_lines: [{ material, qty }]
create function create_transfer(p_head jsonb, p_lines jsonb) returns text language plpgsql as $$
declare
  v_id bigint;
  v_no text;
  v_date date := (p_head->>'date')::date;
  v_from bigint := (p_head->>'from')::bigint;
  v_to bigint := (p_head->>'to')::bigint;
begin
  perform lock_stock();
  insert into transfers (doc_date, from_store_id, to_store_id, requested_by, notes, by_name)
  values (v_date, v_from, v_to, nullif(p_head->>'requested_by', ''), nullif(p_head->>'notes', ''), p_head->>'by')
  returning id, doc_no into v_id, v_no;
  insert into transfer_items (transfer_id, material_id, qty)
  select v_id, (l->>'material')::bigint, (l->>'qty')::numeric from jsonb_array_elements(p_lines) l;
  insert into stock_moves (move_date, store_id, material_id, qty, ref_type, ref_no, by_name)
  select v_date, s.store, i.material_id, s.sign * i.qty, 'ISSUE', v_no, p_head->>'by'
    from transfer_items i cross join (values (v_from, -1), (v_to, 1)) s (store, sign)
   where i.transfer_id = v_id;
  perform check_stock((select jsonb_agg(jsonb_build_object('store', v_from, 'material', l->>'material')) from jsonb_array_elements(p_lines) l));
  return v_no;
end $$;

-- Opening stock (go-live) or an adjustment (+ found / - lost, with a reason).
-- Opening is refused for a store + material that already has stock movements.
-- p_lines: [{ store, material, qty, note }]
create function post_adjustment(p_type text, p_date date, p_lines jsonb, p_by text) returns text language plpgsql as $$
declare
  v_no text;
  v_mat text;
begin
  if p_type not in ('OPENING', 'ADJUST') then raise exception 'Unknown adjustment type.'; end if;
  perform lock_stock();
  if p_type = 'OPENING' then
    select m.code into v_mat
      from jsonb_array_elements(p_lines) l
      join stock_moves v on v.store_id = (l->>'store')::bigint and v.material_id = (l->>'material')::bigint
      join materials m on m.id = v.material_id
     limit 1;
    if v_mat is not null then raise exception '% already has stock in that store: use an adjustment instead.', v_mat; end if;
  end if;
  v_no := next_inv_no(case p_type when 'OPENING' then 'OPN' else 'ADJ' end);
  insert into stock_moves (move_date, store_id, material_id, qty, ref_type, ref_no, note, by_name)
  select p_date, (l->>'store')::bigint, (l->>'material')::bigint, (l->>'qty')::numeric, p_type, v_no, nullif(l->>'note', ''), p_by
    from jsonb_array_elements(p_lines) l;
  perform check_stock(p_lines);
  return v_no;
end $$;

-- Stock report: per store + material, opening before p_from, in and out between p_from and p_to, closing at p_to.
create function stock_summary(p_from date, p_to date, p_plant text default null, p_store bigint default null)
returns table (store_id bigint, store text, plant_code text, material_id bigint, code text, name text, category text,
               uom text, min_level numeric, max_level numeric, opening numeric, inward numeric, outward numeric, closing numeric)
language sql stable as $$
  select s.id, s.name, s.plant_code, m.id, m.code, m.name, m.category, m.uom, m.min_level, m.max_level,
         coalesce(sum(v.qty) filter (where v.move_date < p_from), 0),
         coalesce(sum(v.qty) filter (where v.move_date >= p_from and v.qty > 0), 0),
         coalesce(-sum(v.qty) filter (where v.move_date >= p_from and v.qty < 0), 0),
         sum(v.qty)
    from stock_moves v
    join stores s on s.id = v.store_id
    join materials m on m.id = v.material_id
   where v.move_date <= p_to
     and (p_plant is null or s.plant_code = p_plant)
     and (p_store is null or s.id = p_store)
   group by s.id, m.id
   order by s.plant_code, s.name, m.code
$$;

revoke execute on function next_inv_no(text)                          from public, anon, authenticated;
revoke execute on function lock_stock()                               from public, anon, authenticated;
revoke execute on function check_stock(jsonb)                         from public, anon, authenticated;
revoke execute on function create_po(jsonb, jsonb)                    from public, anon, authenticated;
revoke execute on function create_grn(jsonb, jsonb)                   from public, anon, authenticated;
revoke execute on function qc_grn(bigint, jsonb, text)                from public, anon, authenticated;
revoke execute on function create_transfer(jsonb, jsonb)              from public, anon, authenticated;
revoke execute on function post_adjustment(text, date, jsonb, text)   from public, anon, authenticated;
revoke execute on function stock_summary(date, date, text, bigint)    from public, anon, authenticated;
