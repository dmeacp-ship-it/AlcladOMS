-- migrate-017: Phase 2 — FG inventory, orders ↔ FG, production planning, production entry, FG QC (27 Oct 2026).
-- Run in Supabase -> SQL Editor after migrate-015 and migrate-016.
--
-- Two inventories, kept apart:
--   RM (migrate-015): materials + stock_moves, in KG. Production now takes RM used off the line (ref_type USE).
--   FG (this file):   fg_items (one product + size) + fg_moves, in pieces; M2 = pieces × width × length.
-- FG comes in only from FG QC (or opening / adjustment) and goes out only by a DO.
-- An order line's "ready" quantity (Mark ready, ready_qty) is its FG reservation.
-- Company Settings (app_settings): fg_link = orders use FG stock; fg_store = FG store code orders ship from;
-- fg_auto_reserve = after FG comes in, reserve it for the oldest waiting orders.

-- ── FG items: product + size, made automatically from the quote attributes ──
create table fg_items (
  id         bigint generated always as identity primary key,
  code       text not null unique,
  brand      text,
  grade      text,
  color_code text,
  color_name text,
  core       text,
  skin       numeric,
  width      numeric,
  length     numeric,
  thickness  numeric,
  b_grade    boolean not null default false,
  m2_per_pc  numeric generated always as (coalesce(width, 0) * coalesce(length, 0) / 1000000) stored,
  created_at timestamptz not null default now()
);
create unique index fg_items_key on fg_items (coalesce(brand, ''), coalesce(grade, ''), coalesce(color_code, ''),
  coalesce(core, ''), coalesce(skin, -1), coalesce(width, -1), coalesce(length, -1), coalesce(thickness, -1), b_grade);

-- Find or create the FG item. Code: BRAND-GRADE-COLOR-CORE-SKIN-W*L*TMM (+ -B for B-grade).
create function fg_item_for(p_brand text, p_grade text, p_color text, p_color_name text, p_core text, p_skin numeric,
                            p_width numeric, p_length numeric, p_thickness numeric, p_b boolean default false)
returns bigint language plpgsql as $$
declare
  v_id bigint;
begin
  select id into v_id from fg_items
   where coalesce(brand, '') = coalesce(p_brand, '') and coalesce(grade, '') = coalesce(p_grade, '')
     and coalesce(color_code, '') = coalesce(p_color, '') and coalesce(core, '') = coalesce(p_core, '')
     and coalesce(skin, -1) = coalesce(p_skin, -1) and coalesce(width, -1) = coalesce(p_width, -1)
     and coalesce(length, -1) = coalesce(p_length, -1) and coalesce(thickness, -1) = coalesce(p_thickness, -1)
     and b_grade = p_b;
  if v_id is not null then return v_id; end if;
  insert into fg_items (code, brand, grade, color_code, color_name, core, skin, width, length, thickness, b_grade)
  values (concat_ws('-', p_brand, p_grade, p_color, p_core, trim_scale(p_skin)::text)
            || case when p_width > 0 then '-' || trim_scale(p_width) || '*' || trim_scale(p_length) || '*' || trim_scale(p_thickness) || 'MM' else '' end
            || case when p_b then '-B' else '' end,
          p_brand, p_grade, p_color, p_color_name, p_core, p_skin, p_width, p_length, p_thickness, p_b)
  on conflict do nothing
  returning id into v_id;
  if v_id is null then  -- made by someone else at the same moment
    return fg_item_for(p_brand, p_grade, p_color, p_color_name, p_core, p_skin, p_width, p_length, p_thickness, p_b);
  end if;
  return v_id;
end $$;

-- Every order line knows its FG item (set on insert / when its attributes change; existing lines filled below).
alter table order_items add column fg_item_id bigint references fg_items;
create index on order_items (fg_item_id);
create function order_item_fg() returns trigger language plpgsql as $$
begin
  new.fg_item_id := fg_item_for(new.brand, new.grade, new.color_code, new.color_name, new.core, new.skin, new.width, new.length, new.thickness);
  return new;
end $$;
create trigger order_items_fg before insert or update of brand, grade, color_code, core, skin, width, length, thickness
  on order_items for each row execute function order_item_fg();
update order_items set fg_item_id = fg_item_for(brand, grade, color_code, color_name, core, skin, width, length, thickness)
 where fg_item_id is null;

-- ── FG ledger (pieces) ──
create table fg_moves (
  id          bigint generated always as identity primary key,
  move_date   date not null,
  store_id    bigint not null references stores,
  fg_item_id  bigint not null references fg_items,
  qty         numeric not null check (qty <> 0),
  ref_type    text not null check (ref_type in ('OPENING', 'ADJUST', 'QC', 'DISPATCH')),
  ref_no      text,
  dispatch_id bigint references dispatches on delete cascade,  -- undo dispatch deletes the dispatch, and this with it
  note        text,
  by_name     text,
  created_at  timestamptz not null default now()
);
create index on fg_moves (store_id, fg_item_id);
create index on fg_moves (move_date);

-- RM used in production comes off the line.
alter table stock_moves drop constraint stock_moves_ref_type_check;
alter table stock_moves add constraint stock_moves_ref_type_check check (ref_type in ('OPENING', 'ADJUST', 'GRN', 'ISSUE', 'USE'));

-- Open order lines: approved, not short closed, not fully dispatched.
create function open_order_lines() returns table (id bigint, order_id bigint, fg_item_id bigint, balance numeric, ready numeric)
language sql stable as $$
  select i.id, i.order_id, i.fg_item_id, i.qty - coalesce(i.dispatched_qty, 0), coalesce(i.ready_qty, 0)
    from order_items i join orders o on o.id = i.order_id
   where o.status = 'APPROVED' and o.dispatch_status is distinct from 'SHORT_CLOSED' and i.qty > coalesce(i.dispatched_qty, 0)
$$;

create function fg_order_store() returns bigint language sql stable as $$
  select id from stores where code = app_setting('fg_store') and type = 'FG'
$$;

-- Raises if any store + item goes below zero or, while orders use FG stock (fg_link), if the orders' FG store
-- would hold fewer pieces than are reserved (ready) on open orders. p_keys: [{ store, item }].
create function check_fg(p_keys jsonb) returns void language plpgsql as $$
declare
  v_code text;
  v_store text;
  v_short numeric;
  v_order bigint := fg_order_store();
  v_link boolean := app_setting('fg_link') = 'true';
begin
  select f.code, s.name, -(t.q - case when t.store_id = v_order and v_link then coalesce(r.ready, 0) else 0 end)
    into v_code, v_store, v_short
    from (select v.store_id, v.fg_item_id, sum(v.qty) q from fg_moves v
           where (v.store_id, v.fg_item_id) in (select (k->>'store')::bigint, (k->>'item')::bigint from jsonb_array_elements(p_keys) k)
           group by 1, 2) t
    left join (select l.fg_item_id, sum(l.ready) ready from open_order_lines() l group by 1) r on r.fg_item_id = t.fg_item_id
    join fg_items f on f.id = t.fg_item_id
    join stores s on s.id = t.store_id
   where t.q - case when t.store_id = v_order and v_link then coalesce(r.ready, 0) else 0 end < 0
   limit 1;
  if v_code is not null then
    raise exception 'Not enough FG % in %: % pcs short (pieces marked ready for other orders count as taken).', v_code, v_store, trim_scale(v_short);
  end if;
end $$;

-- Settings fg_auto_reserve + fg_link: give free FG pieces of these items to the oldest waiting order lines.
create function fg_auto_reserve(p_items bigint[], p_by text) returns void language plpgsql as $$
declare
  v_store bigint := fg_order_store();
  r record;
  v_free numeric;
  v_add numeric;
begin
  if app_setting('fg_auto_reserve') is distinct from 'true' or app_setting('fg_link') is distinct from 'true' or v_store is null then return; end if;
  for r in select l.* from open_order_lines() l where l.fg_item_id = any (p_items) and l.balance > l.ready order by l.order_id, l.id loop
    select coalesce((select sum(qty) from fg_moves where store_id = v_store and fg_item_id = r.fg_item_id), 0)
         - coalesce((select sum(ready) from open_order_lines() where fg_item_id = r.fg_item_id), 0) into v_free;
    v_add := least(v_free, r.balance - r.ready);
    continue when v_add <= 0;
    update order_items set ready_qty = ready_qty + v_add, ready_at = now(), production_status = 'Ready for Dispatch' where id = r.id;
    insert into order_events (order_id, by_name, action, detail)
    select r.order_id, p_by, 'Marked ready for dispatch', 'Line ' || item_no || ': +' || trim_scale(v_add) || ' PCS reserved from FG stock (automatic)'
      from order_items where id = r.id;
  end loop;
end $$;

-- DO: same as migrate-004, plus (setting fg_link) the dispatched pieces leave the orders' FG store.
create or replace function generate_batch_do(p_order bigint, p_lines jsonb, p_info jsonb, p_by text) returns text language plpgsql as $$
declare
  v_batch bigint;
  v_batch_no int;
  v_do_no text;
  v_today date := (now() at time zone 'Asia/Riyadh')::date;
  v_link boolean := app_setting('fg_link') = 'true';
  v_store bigint := fg_order_store();
begin
  perform 1 from orders where id = p_order and status = 'APPROVED' for update;
  if not found then raise exception 'Order is not approved.'; end if;
  if v_link and v_store is null then raise exception 'Pick the FG store orders ship from in Company Settings (Inventory).'; end if;
  if v_link then perform lock_stock(); end if;

  select coalesce(max(batch_no), 0) + 1 into v_batch_no from order_batches where order_id = p_order;
  insert into order_batches (order_id, batch_no, do_date, do_by, dispatch_date, vehicle_no, transporter, lr_no, driver, transport)
  values (p_order, v_batch_no, v_today, p_by, coalesce((p_info->>'date')::date, v_today),
          nullif(p_info->>'vehicle_no', ''), nullif(p_info->>'transporter', ''),
          nullif(p_info->>'lr_no', ''), nullif(p_info->>'driver', ''), coalesce((p_info->>'transport')::numeric, 0))
  returning id into v_batch;
  v_do_no := assign_batch_no(v_batch, 'DO');

  insert into batch_items (batch_id, order_item_id, do_qty, do_m2)
    select v_batch, (l->>'id')::bigint, (l->>'qty')::numeric, (l->>'m2')::numeric
      from jsonb_array_elements(p_lines) l where (l->>'qty')::numeric > 0;

  update order_items i
     set dispatched_qty = coalesce(i.dispatched_qty, 0) + (l->>'qty')::numeric,
         ready_qty      = greatest(coalesce(i.ready_qty, 0) - (l->>'qty')::numeric, 0)
    from jsonb_array_elements(p_lines) l
   where i.id = (l->>'id')::bigint and (l->>'qty')::numeric > 0;

  with d as (
    insert into dispatches (order_id, order_item_id, qty, dispatch_date, vehicle_no, transporter, lr_no, driver, by_name)
    select p_order, (l->>'id')::bigint, (l->>'qty')::numeric, coalesce((p_info->>'date')::date, v_today),
           nullif(p_info->>'vehicle_no', ''), nullif(p_info->>'transporter', ''),
           nullif(p_info->>'lr_no', ''), nullif(p_info->>'driver', ''), p_by
      from jsonb_array_elements(p_lines) l where (l->>'qty')::numeric > 0
    returning id, order_item_id, qty, dispatch_date
  )
  insert into fg_moves (move_date, store_id, fg_item_id, qty, ref_type, ref_no, dispatch_id, by_name)
  select d.dispatch_date, v_store, i.fg_item_id, -d.qty, 'DISPATCH', v_do_no, d.id, p_by
    from d join order_items i on i.id = d.order_item_id
   where v_link and i.fg_item_id is not null;

  if v_link then
    perform check_fg((select jsonb_agg(jsonb_build_object('store', v_store, 'item', i.fg_item_id))
                        from jsonb_array_elements(p_lines) l join order_items i on i.id = (l->>'id')::bigint));
  end if;

  update orders
     set do_date = coalesce(do_date, v_today), doc_no = coalesce(doc_no, v_do_no), do_by = coalesce(do_by, p_by),
         dispatch_status = case
           when (select coalesce(sum(qty - dispatched_qty), 0) from order_items where order_id = p_order) <= 0 then 'DISPATCHED'
           else 'PARTIAL' end
   where id = p_order;
  return v_do_no;
end $$;

-- ── Production plan (one per date + shift + line, many items; no work order per sales order) ──
create table production_plans (
  id           bigint generated always as identity primary key,
  plan_no      text not null unique default next_inv_no('PLN'),
  plan_date    date not null,
  shift        text not null check (shift in ('DAY', 'NIGHT')),
  line_store_id bigint not null references stores,
  status       text not null default 'OPEN' check (status in ('OPEN', 'DONE')),
  notes        text,
  by_name      text,
  created_at   timestamptz not null default now()
);
create table plan_items (
  id           bigint generated always as identity primary key,
  plan_id      bigint not null references production_plans on delete cascade,
  fg_item_id   bigint not null references fg_items,
  qty          numeric not null check (qty > 0),
  produced_qty numeric not null default 0          -- good pieces entered on production entries
);
create index on plan_items (plan_id);
alter table transfers add column plan_id bigint references production_plans;  -- RM issued for a plan

-- p_head: { date, shift, line, notes, by }; p_lines: [{ item, qty }]
create function create_plan(p_head jsonb, p_lines jsonb) returns text language plpgsql as $$
declare
  v_id bigint;
  v_no text;
begin
  perform 1 from stores where id = (p_head->>'line')::bigint and type = 'WIP';
  if not found then raise exception 'Pick a production line (a WIP store).'; end if;
  insert into production_plans (plan_date, shift, line_store_id, notes, by_name)
  values ((p_head->>'date')::date, p_head->>'shift', (p_head->>'line')::bigint, nullif(p_head->>'notes', ''), p_head->>'by')
  returning id, plan_no into v_id, v_no;
  insert into plan_items (plan_id, fg_item_id, qty)
  select v_id, (l->>'item')::bigint, (l->>'qty')::numeric from jsonb_array_elements(p_lines) l;
  return v_no;
end $$;

-- ── Production entry (DPR): good / rejected pieces, RM used off the line ──
create table productions (
  id            bigint generated always as identity primary key,
  dpr_no        text not null unique default next_inv_no('DPR'),
  prod_date     date not null,
  shift         text not null check (shift in ('DAY', 'NIGHT')),
  line_store_id bigint not null references stores,
  plan_id       bigint references production_plans,
  operator      text,
  notes         text,
  by_name       text,
  created_at    timestamptz not null default now()
);
create table production_items (
  id            bigint generated always as identity primary key,
  production_id bigint not null references productions on delete cascade,
  plan_item_id  bigint references plan_items,
  fg_item_id    bigint not null references fg_items,
  good_qty      numeric not null default 0 check (good_qty >= 0),
  rejected_qty  numeric not null default 0 check (rejected_qty >= 0),
  reject_reason text,
  qc_pass       numeric,      -- FG QC: pass + b + reject = good_qty
  qc_b          numeric,
  qc_reject     numeric,
  qc_reason     text,
  qc_by         text,
  qc_at         timestamptz,
  check (good_qty + rejected_qty > 0)
);
create index on production_items (production_id);
create index on production_items (fg_item_id) where qc_at is null;

-- ── FG position: stock in the orders' FG store, reserved, still needed, planned, in QC (planning board, Plant) ──
create function fg_position() returns table (fg_item_id bigint, stock numeric, reserved numeric, need numeric, planned numeric, in_qc numeric)
language sql stable as $$
  with s as (select fg_item_id, sum(qty) q from fg_moves where store_id = fg_order_store() group by 1),
       o as (select fg_item_id, sum(ready) r, sum(balance - ready) n from open_order_lines() group by 1),
       p as (select pi.fg_item_id, sum(greatest(pi.qty - pi.produced_qty, 0)) q from plan_items pi
               join production_plans pp on pp.id = pi.plan_id where pp.status = 'OPEN' group by 1),
       c as (select fg_item_id, sum(good_qty) q from production_items where qc_at is null group by 1)
  select f.id, coalesce(s.q, 0), coalesce(o.r, 0), coalesce(o.n, 0), coalesce(p.q, 0), coalesce(c.q, 0)
    from fg_items f left join s on s.fg_item_id = f.id left join o on o.fg_item_id = f.id
    left join p on p.fg_item_id = f.id left join c on c.fg_item_id = f.id
   where s.q is not null or o.r is not null or p.q is not null or c.q is not null
$$;

-- p_head: { date, shift, line, plan, operator, notes, by }; p_items: [{ item, plan_item, good, rejected, reason }];
-- p_usage: [{ material, qty }] taken off the line.
create function create_production(p_head jsonb, p_items jsonb, p_usage jsonb) returns text language plpgsql as $$
declare
  v_id bigint;
  v_no text;
  v_line bigint := (p_head->>'line')::bigint;
  v_date date := (p_head->>'date')::date;
begin
  perform 1 from stores where id = v_line and type = 'WIP';
  if not found then raise exception 'Pick a production line (a WIP store).'; end if;
  perform lock_stock();
  insert into productions (prod_date, shift, line_store_id, plan_id, operator, notes, by_name)
  values (v_date, p_head->>'shift', v_line, nullif(p_head->>'plan', '')::bigint, nullif(p_head->>'operator', ''), nullif(p_head->>'notes', ''), p_head->>'by')
  returning id, dpr_no into v_id, v_no;
  insert into production_items (production_id, plan_item_id, fg_item_id, good_qty, rejected_qty, reject_reason)
  select v_id, nullif(l->>'plan_item', '')::bigint, (l->>'item')::bigint, coalesce((l->>'good')::numeric, 0),
         coalesce((l->>'rejected')::numeric, 0), nullif(l->>'reason', '')
    from jsonb_array_elements(p_items) l;
  update plan_items pi set produced_qty = pi.produced_qty + coalesce((l->>'good')::numeric, 0)
    from jsonb_array_elements(p_items) l where pi.id = nullif(l->>'plan_item', '')::bigint;
  update production_plans pp set status = 'DONE'
   where pp.id in (select plan_id from plan_items where id in (select nullif(l->>'plan_item', '')::bigint from jsonb_array_elements(p_items) l))
     and not exists (select 1 from plan_items pi where pi.plan_id = pp.id and pi.produced_qty < pi.qty);
  if jsonb_array_length(coalesce(p_usage, '[]')) > 0 then
    insert into stock_moves (move_date, store_id, material_id, qty, ref_type, ref_no, by_name)
    select v_date, v_line, (u->>'material')::bigint, -(u->>'qty')::numeric, 'USE', v_no, p_head->>'by'
      from jsonb_array_elements(p_usage) u;
    perform check_stock((select jsonb_agg(jsonb_build_object('store', v_line, 'material', u->>'material')) from jsonb_array_elements(p_usage) u));
  end if;
  return v_no;
end $$;

-- FG QC of produced pieces: pass -> FG store of the line's plant; B-grade -> same item + -B there; reject recorded.
-- p_lines: [{ id (production_item), pass, b, reject, reason }]
create function qc_production(p_lines jsonb, p_by text) returns int language plpgsql as $$
declare
  v_bad int;
  v_items bigint[];
begin
  perform lock_stock();
  select count(*) into v_bad
    from jsonb_array_elements(p_lines) l
    left join production_items pi on pi.id = (l->>'id')::bigint and pi.qc_at is null
   where pi.id is null
      or coalesce((l->>'pass')::numeric, 0) < 0 or coalesce((l->>'b')::numeric, 0) < 0 or coalesce((l->>'reject')::numeric, 0) < 0
      or coalesce((l->>'pass')::numeric, 0) + coalesce((l->>'b')::numeric, 0) + coalesce((l->>'reject')::numeric, 0) <> pi.good_qty;
  if v_bad > 0 then raise exception 'On every row pass + B-grade + reject must equal the good pieces produced (and QC not done yet) - refresh and try again.'; end if;
  if exists (select 1 from jsonb_array_elements(p_lines) l join production_items pi on pi.id = (l->>'id')::bigint
              join productions p on p.id = pi.production_id join stores ln on ln.id = p.line_store_id
             where not exists (select 1 from stores s where s.plant_code = ln.plant_code and s.type = 'FG')) then
    raise exception 'That plant has no FG store yet: add one under Settings -> Stores (type FG).';
  end if;
  update production_items pi
     set qc_pass = coalesce((l->>'pass')::numeric, 0), qc_b = coalesce((l->>'b')::numeric, 0),
         qc_reject = coalesce((l->>'reject')::numeric, 0), qc_reason = nullif(l->>'reason', ''), qc_by = p_by, qc_at = now()
    from jsonb_array_elements(p_lines) l where pi.id = (l->>'id')::bigint;
  -- FG store of the plant the line belongs to (the first one, if there are several).
  with q as (
    select pi.*, p.prod_date, p.dpr_no,
           (select s.id from stores s join stores ln on ln.plant_code = s.plant_code where ln.id = p.line_store_id and s.type = 'FG' order by s.id limit 1) fg_store
      from production_items pi join productions p on p.id = pi.production_id
     where pi.id in (select (l->>'id')::bigint from jsonb_array_elements(p_lines) l)
  ), m as (
    select prod_date, fg_store, fg_item_id, qc_pass qty, dpr_no from q where qc_pass > 0
    union all
    select q.prod_date, q.fg_store, fg_item_for(f.brand, f.grade, f.color_code, f.color_name, f.core, f.skin, f.width, f.length, f.thickness, true), q.qc_b, q.dpr_no
      from q join fg_items f on f.id = q.fg_item_id where q.qc_b > 0
  ), ins as (
    insert into fg_moves (move_date, store_id, fg_item_id, qty, ref_type, ref_no, by_name)
    select prod_date, fg_store, fg_item_id, qty, 'QC', dpr_no, p_by from m returning fg_item_id
  )
  select array_agg(distinct fg_item_id) into v_items from ins;
  perform fg_auto_reserve(coalesce(v_items, '{}'), p_by);
  return jsonb_array_length(p_lines);
end $$;

-- FG opening stock / adjustment. p_lines: [{ store, item, qty, note }] or, instead of item, the attributes
-- { brand, grade, color_code, color_name, core, skin, width, length, thickness } (CSV import).
create function post_fg_adjustment(p_type text, p_date date, p_lines jsonb, p_by text) returns text language plpgsql as $$
declare
  v_no text;
  v_code text;
  v_lines jsonb;
begin
  if p_type not in ('OPENING', 'ADJUST') then raise exception 'Unknown adjustment type.'; end if;
  perform lock_stock();
  select jsonb_agg(l || jsonb_build_object('item', coalesce((l->>'item')::bigint, fg_item_for(l->>'brand', l->>'grade', l->>'color_code',
           l->>'color_name', l->>'core', (l->>'skin')::numeric, (l->>'width')::numeric, (l->>'length')::numeric, (l->>'thickness')::numeric))))
    into v_lines from jsonb_array_elements(p_lines) l;
  if exists (select 1 from jsonb_array_elements(v_lines) l left join stores s on s.id = (l->>'store')::bigint where s.type is distinct from 'FG') then
    raise exception 'FG stock can only be in an FG store.';
  end if;
  if p_type = 'OPENING' then
    select f.code into v_code from jsonb_array_elements(v_lines) l
      join fg_moves v on v.store_id = (l->>'store')::bigint and v.fg_item_id = (l->>'item')::bigint
      join fg_items f on f.id = v.fg_item_id limit 1;
    if v_code is not null then raise exception '% already has FG stock in that store: use an adjustment instead.', v_code; end if;
  end if;
  v_no := next_inv_no(case p_type when 'OPENING' then 'FGO' else 'FGA' end);
  insert into fg_moves (move_date, store_id, fg_item_id, qty, ref_type, ref_no, note, by_name)
  select p_date, (l->>'store')::bigint, (l->>'item')::bigint, (l->>'qty')::numeric, p_type, v_no, nullif(l->>'note', ''), p_by
    from jsonb_array_elements(v_lines) l;
  perform check_fg((select jsonb_agg(jsonb_build_object('store', l->>'store', 'item', l->>'item')) from jsonb_array_elements(v_lines) l));
  perform fg_auto_reserve((select array_agg(distinct (l->>'item')::bigint) from jsonb_array_elements(v_lines) l where (l->>'qty')::numeric > 0), p_by);
  return v_no;
end $$;

-- FG stock report: per store + item, pieces (M2 = pieces × m2_per_pc in the app).
create function fg_stock_summary(p_from date, p_to date, p_store bigint default null)
returns table (store_id bigint, store text, plant_code text, fg_item_id bigint, code text, color_name text, b_grade boolean,
               m2_per_pc numeric, opening numeric, inward numeric, outward numeric, closing numeric)
language sql stable as $$
  select s.id, s.name, s.plant_code, f.id, f.code, f.color_name, f.b_grade, f.m2_per_pc,
         coalesce(sum(v.qty) filter (where v.move_date < p_from), 0),
         coalesce(sum(v.qty) filter (where v.move_date >= p_from and v.qty > 0), 0),
         coalesce(-sum(v.qty) filter (where v.move_date >= p_from and v.qty < 0), 0),
         sum(v.qty)
    from fg_moves v join stores s on s.id = v.store_id join fg_items f on f.id = v.fg_item_id
   where v.move_date <= p_to and (p_store is null or s.id = p_store)
   group by s.id, f.id
   order by s.plant_code, s.name, f.code
$$;

alter table fg_items         enable row level security;
alter table fg_moves         enable row level security;
alter table production_plans enable row level security;
alter table plan_items       enable row level security;
alter table productions      enable row level security;
alter table production_items enable row level security;

revoke execute on function fg_item_for(text, text, text, text, text, numeric, numeric, numeric, numeric, boolean) from public, anon, authenticated;
revoke execute on function order_item_fg()                                   from public, anon, authenticated;
revoke execute on function open_order_lines()                                from public, anon, authenticated;
revoke execute on function fg_order_store()                                  from public, anon, authenticated;
revoke execute on function check_fg(jsonb)                                   from public, anon, authenticated;
revoke execute on function fg_auto_reserve(bigint[], text)                   from public, anon, authenticated;
revoke execute on function generate_batch_do(bigint, jsonb, jsonb, text)     from public, anon, authenticated;
revoke execute on function fg_position()                                     from public, anon, authenticated;
revoke execute on function create_plan(jsonb, jsonb)                         from public, anon, authenticated;
revoke execute on function create_production(jsonb, jsonb, jsonb)           from public, anon, authenticated;
revoke execute on function qc_production(jsonb, text)                        from public, anon, authenticated;
revoke execute on function post_fg_adjustment(text, date, jsonb, text)      from public, anon, authenticated;
revoke execute on function fg_stock_summary(date, date, bigint)             from public, anon, authenticated;
