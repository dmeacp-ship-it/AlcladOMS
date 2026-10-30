-- migrate-019: Parametric BOM & Real Material Consumption Tracking (30 Oct 2026).
-- Run in Supabase -> SQL Editor after migrate-018.

-- 1. Extend materials table with classification fields for coil & layer matching
alter table materials add column if not exists kind text check (kind in ('TOP_COIL', 'BOTTOM_COIL', 'CORE', 'ADHESIVE', 'MASKING', 'OTHER'));
alter table materials add column if not exists color_code text;
alter table materials add column if not exists color_name text;
alter table materials add column if not exists cost_price numeric not null default 0 check (cost_price >= 0);

create index if not exists materials_kind_idx on materials (kind);
create index if not exists materials_coil_match_idx on materials (kind, color_code, thickness, width);

-- 2. Parametric Core Settings table (replaces hardcoded recipe lists)
create table if not exists core_settings (
  core_type         text primary key, -- 'NFR', 'FRB1', 'FRA2'
  name              text not null,
  density           numeric not null check (density > 0),
  scrap_pct         numeric not null default 3.0 check (scrap_pct >= 0),
  uom               text not null default 'KG',
  core_material_id  bigint references materials on delete set null,
  adh_material_id   bigint references materials on delete set null,
  adh_rate_per_m2   numeric not null default 0.090 check (adh_rate_per_m2 >= 0),
  mask_material_id  bigint references materials on delete set null,
  mask_rate_per_m2  numeric not null default 1.020 check (mask_rate_per_m2 >= 0),
  bottom_skin_mode  text not null default 'SAME_AS_TOP' check (bottom_skin_mode in ('SAME_AS_TOP', 'STANDARD_020', 'CUSTOM')),
  blend_enabled     boolean not null default false,
  blend_components  jsonb not null default '[]'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table core_settings add column if not exists blend_enabled boolean not null default false;
alter table core_settings add column if not exists blend_components jsonb not null default '[]'::jsonb;

alter table core_settings enable row level security;
do $$ begin
  create policy "core_settings_select" on core_settings for select using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "core_settings_all" on core_settings for all using (true);
exception when duplicate_object then null; end $$;

-- 3. Production Consumptions table: stores both System (BOM) and Actual confirmed figures
create table if not exists production_consumptions (
  id                bigint generated always as identity primary key,
  production_id     bigint not null references productions on delete cascade,
  layer_type        text not null check (layer_type in ('TOP_COIL', 'BOTTOM_COIL', 'CORE', 'ADHESIVE_FILM', 'MASKING_FILM', 'CONSUMABLE', 'OTHER')),
  material_id       bigint not null references materials,
  suggested_mat_id  bigint references materials,
  system_qty        numeric not null default 0,
  actual_qty        numeric not null default 0,
  uom               text not null default 'KG',
  diff_qty          numeric generated always as (actual_qty - system_qty) stored,
  diff_pct          numeric generated always as (
    case when system_qty > 0 then round(((actual_qty - system_qty) / system_qty) * 100.0, 2) else 0 end
  ) stored,
  reason            text,
  settings_snapshot jsonb,
  created_at        timestamptz not null default now()
);

create index if not exists prod_consumptions_prod_idx on production_consumptions (production_id);
create index if not exists prod_consumptions_mat_idx on production_consumptions (material_id);

alter table production_consumptions enable row level security;
do $$ begin
  create policy "prod_consumptions_select" on production_consumptions for select using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "prod_consumptions_all" on production_consumptions for all using (true);
exception when duplicate_object then null; end $$;

-- 4. Initial Seed for Core Settings (starting values, editable via BOM screen)
-- Retire old dummy placeholder materials if present
delete from materials where code in ('COIL-TOP', 'COIL-BOT', 'LDPE-01', 'ADH-01');

insert into core_settings (core_type, name, density, scrap_pct, uom, adh_rate_per_m2, mask_rate_per_m2, bottom_skin_mode)
values
  ('NFR',  'Non-Fire Rated (PE Core)',       0.92, 3.0, 'KG', 0.090, 1.020, 'SAME_AS_TOP'),
  ('FRB1', 'Fire Retardant Class B1 Core',   1.60, 3.0, 'KG', 0.100, 1.020, 'SAME_AS_TOP'),
  ('FRA2', 'Non-Combustible Mineral A2 Core', 1.90, 3.0, 'KG', 0.100, 1.020, 'SAME_AS_TOP')
on conflict (core_type) do update set
  density = excluded.density,
  scrap_pct = excluded.scrap_pct,
  updated_at = now();

-- 5. Updated create_production supporting both system vs actual consumption and stock deduction
drop function if exists create_production(jsonb, jsonb, jsonb);
create or replace function create_production(p_head jsonb, p_items jsonb, p_usage jsonb, p_consumption jsonb default '[]'::jsonb)
returns text language plpgsql as $$
declare
  v_id bigint;
  v_no text;
  v_line bigint := (p_head->>'line')::bigint;
  v_date date := (p_head->>'date')::date;
  v_allow_neg boolean := coalesce((p_head->>'allow_negative')::boolean, false);
  v_stock_keys jsonb := '[]'::jsonb;
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

  -- 5a. Record detailed consumption with System vs Actual
  if jsonb_array_length(coalesce(p_consumption, '[]'::jsonb)) > 0 then
    insert into production_consumptions (
      production_id, layer_type, material_id, suggested_mat_id, system_qty, actual_qty, uom, reason, settings_snapshot
    )
    select v_id,
           c->>'layer_type',
           (c->>'material_id')::bigint,
           nullif(c->>'suggested_mat_id', '')::bigint,
           coalesce((c->>'system_qty')::numeric, 0),
           coalesce((c->>'actual_qty')::numeric, 0),
           coalesce(c->>'uom', 'KG'),
           nullif(c->>'reason', ''),
           c->'settings_snapshot'
      from jsonb_array_elements(p_consumption) c;

    -- Deduct actual quantities from the line store
    insert into stock_moves (move_date, store_id, material_id, qty, ref_type, ref_no, by_name)
    select v_date, v_line, (c->>'material_id')::bigint, -coalesce((c->>'actual_qty')::numeric, 0), 'USE', v_no, p_head->>'by'
      from jsonb_array_elements(p_consumption) c
     where coalesce((c->>'actual_qty')::numeric, 0) > 0;

    v_stock_keys := (
      select jsonb_agg(jsonb_build_object('store', v_line, 'material', c->>'material_id'))
        from jsonb_array_elements(p_consumption) c
       where coalesce((c->>'actual_qty')::numeric, 0) > 0
    );

  -- 5b. Fallback to legacy p_usage if p_consumption not provided
  elsif jsonb_array_length(coalesce(p_usage, '[]'::jsonb)) > 0 then
    insert into stock_moves (move_date, store_id, material_id, qty, ref_type, ref_no, by_name)
    select v_date, v_line, (u->>'material')::bigint, -(u->>'qty')::numeric, 'USE', v_no, p_head->>'by'
      from jsonb_array_elements(p_usage) u
     where coalesce((u->>'qty')::numeric, 0) > 0;

    v_stock_keys := (
      select jsonb_agg(jsonb_build_object('store', v_line, 'material', u->>'material'))
        from jsonb_array_elements(p_usage) u
       where coalesce((u->>'qty')::numeric, 0) > 0
    );
  end if;

  -- 5c. Validate stock unless allow_negative was explicitly permitted
  if not v_allow_neg and v_stock_keys is not null and jsonb_array_length(v_stock_keys) > 0 then
    perform check_stock(v_stock_keys);
  end if;

  return v_no;
end $$;

-- 6. Consumption Variance Report SQL query helper
create or replace function consumption_variance_report(
  p_from date,
  p_to date,
  p_line bigint default null,
  p_material bigint default null,
  p_layer text default null
)
returns table (
  consumption_id bigint,
  prod_date date,
  dpr_no text,
  line_name text,
  layer_type text,
  material_id bigint,
  material_code text,
  material_name text,
  suggested_code text,
  system_qty numeric,
  actual_qty numeric,
  diff_qty numeric,
  diff_pct numeric,
  uom text,
  cost_price numeric,
  variance_value_sar numeric,
  reason text,
  by_name text
) language sql stable as $$
  select pc.id,
         p.prod_date,
         p.dpr_no,
         s.name as line_name,
         pc.layer_type,
         m.id as material_id,
         m.code as material_code,
         m.name as material_name,
         sm.code as suggested_code,
         pc.system_qty,
         pc.actual_qty,
         pc.diff_qty,
         pc.diff_pct,
         pc.uom,
         coalesce(m.cost_price, 0) as cost_price,
         round(pc.diff_qty * coalesce(m.cost_price, 0), 2) as variance_value_sar,
         pc.reason,
         p.by_name
    from production_consumptions pc
    join productions p on p.id = pc.production_id
    join stores s on s.id = p.line_store_id
    join materials m on m.id = pc.material_id
    left join materials sm on sm.id = pc.suggested_mat_id
   where p.prod_date between p_from and p_to
     and (p_line is null or p.line_store_id = p_line)
     and (p_material is null or pc.material_id = p_material)
     and (p_layer is null or pc.layer_type = p_layer)
   order by p.prod_date desc, p.id desc, pc.id asc;
$$;
