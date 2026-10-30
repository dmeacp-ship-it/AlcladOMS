-- migrate-018: Phase 3 — BOM (Bill of Materials) & Parametric Recipes (29 Oct 2026).
-- Run in Supabase -> SQL Editor after migrate-017.
--
-- Parametric Recipes for Aluminum Composite Panel (ACP) manufacturing:
--   Recipes are defined by Grade (PE, FR-B1, FR-A2), Total Thickness (mm),
--   Top Skin (mm) and Bottom Skin (mm).
--   Core thickness is calculated automatically: total_thickness - top_skin - bottom_skin.
--   Each recipe defines standard layer consumption per M2 (KG/M2 or M2/M2)
--   with scrap/trimming allowances.
--
-- Flow:
--   1. Define / tune standard Parametric Recipes (boms, bom_items).
--   2. In Production Planning: auto-calculate exact RM needed from the BOM.
--   3. Auto-issue from BOM: transfers material from RM store to Line store.

create table if not exists boms (
  id            bigint generated always as identity primary key,
  code          text not null unique default next_inv_no('BOM'),
  name          text not null,
  grade         text not null check (grade in ('PE', 'FR-B1', 'FR-A2', 'SPECIAL')),
  thickness     numeric not null check (thickness > 0),
  top_skin      numeric not null check (top_skin > 0),
  bottom_skin   numeric not null check (bottom_skin > 0),
  core_thick    numeric generated always as (thickness - top_skin - bottom_skin) stored,
  description   text,
  is_active     boolean not null default true,
  created_by    text,
  created_at    timestamptz not null default now()
);

create unique index if not exists boms_spec_key on boms (grade, thickness, top_skin, bottom_skin);

create table if not exists bom_items (
  id             bigint generated always as identity primary key,
  bom_id         bigint not null references boms on delete cascade,
  layer_type     text not null check (layer_type in ('TOP_COIL', 'BOTTOM_COIL', 'CORE', 'ADHESIVE_FILM', 'MASKING_FILM', 'CONSUMABLE')),
  layer_name     text not null,
  category       text not null check (category in ('RM', 'GRANULE', 'CONSUMABLE', 'SCRAP')),
  default_mat_id bigint references materials on delete set null,
  qty_per_m2     numeric not null check (qty_per_m2 >= 0),
  uom            text not null default 'KG',
  scrap_pct      numeric not null default 0 check (scrap_pct >= 0),
  calc_formula   text,
  sort_order     int not null default 0
);
create index if not exists bom_items_bom_id_idx on bom_items (bom_id);

alter table boms enable row level security;
alter table bom_items enable row level security;

-- Find best matching recipe for panel specifications
create or replace function find_bom(p_grade text, p_thickness numeric, p_top_skin numeric, p_bottom_skin numeric)
returns bigint language plpgsql stable as $$
declare
  v_id bigint;
begin
  -- 1. Exact match on grade, thickness, top skin, bottom skin
  select id into v_id from boms
   where is_active
     and upper(grade) = upper(coalesce(p_grade, 'PE'))
     and thickness = coalesce(p_thickness, 4.0)
     and top_skin = coalesce(p_top_skin, 0.25)
     and bottom_skin = coalesce(p_bottom_skin, 0.20)
   limit 1;
  if v_id is not null then return v_id; end if;

  -- 2. Match on grade and thickness
  select id into v_id from boms
   where is_active
     and upper(grade) = upper(coalesce(p_grade, 'PE'))
     and thickness = coalesce(p_thickness, 4.0)
   order by abs(top_skin - coalesce(p_top_skin, 0.25)) asc
   limit 1;
  if v_id is not null then return v_id; end if;

  -- 3. Match on grade alone
  select id into v_id from boms
   where is_active
     and upper(grade) = upper(coalesce(p_grade, 'PE'))
   order by id asc
   limit 1;
  if v_id is not null then return v_id; end if;

  -- 4. Fallback to any active recipe
  select id into v_id from boms where is_active order by id asc limit 1;
  return v_id;
end $$;

-- Calculate raw material requirements for an entire production plan
create or replace function calc_plan_bom_requirements(p_plan_id bigint)
returns table (
  layer_type    text,
  layer_name    text,
  material_id   bigint,
  material_code text,
  material_name text,
  uom           text,
  qty_needed    numeric,
  scrap_qty     numeric,
  total_qty     numeric
) language plpgsql stable as $$
begin
  return query
  with items as (
    select pi.qty, f.width, f.length, f.thickness, f.skin, f.grade, f.m2_per_pc,
           (pi.qty * f.m2_per_pc) as total_m2,
           find_bom(f.grade, f.thickness, f.skin, 0.20) as matched_bom_id
      from plan_items pi
      join fg_items f on f.id = pi.fg_item_id
     where pi.plan_id = p_plan_id
  ),
  reqs as (
    select bi.layer_type,
           bi.layer_name,
           bi.default_mat_id,
           bi.uom,
           bi.sort_order,
           sum(it.total_m2 * bi.qty_per_m2) as raw_needed,
           sum(it.total_m2 * bi.qty_per_m2 * (bi.scrap_pct / 100.0)) as scrap_calc,
           sum(it.total_m2 * bi.qty_per_m2 * (1.0 + bi.scrap_pct / 100.0)) as total_calc
      from items it
      join bom_items bi on bi.bom_id = it.matched_bom_id
     group by bi.layer_type, bi.layer_name, bi.default_mat_id, bi.uom, bi.sort_order
  )
  select r.layer_type,
         r.layer_name,
         r.default_mat_id as material_id,
         coalesce(m.code, '—') as material_code,
         coalesce(m.name, r.layer_name) as material_name,
         r.uom,
         round(r.raw_needed, 3) as qty_needed,
         round(r.scrap_calc, 3) as scrap_qty,
         round(r.total_calc, 3) as total_qty
    from reqs r
    left join materials m on m.id = r.default_mat_id
   order by r.sort_order asc;
end $$;

-- ── Standard Default Seed Recipes for Saudi / GCC ACP Plants ──
do $$
declare
  v_b1 bigint;
  v_b2 bigint;
  v_b3 bigint;
  v_top_id bigint;
  v_bot_id bigint;
  v_core_id bigint;
  v_adh_id bigint;
begin
  select id into v_top_id  from materials where code = 'COIL-TOP' limit 1;
  select id into v_bot_id  from materials where code = 'COIL-BOT' limit 1;
  select id into v_core_id from materials where code = 'LDPE-01'  limit 1;
  select id into v_adh_id  from materials where code = 'ADH-01'   limit 1;

  -- 1. Standard ACP 4mm PE (0.25 / 0.20)
  if not exists (select 1 from boms where grade = 'PE' and thickness = 4.0 and top_skin = 0.25 and bottom_skin = 0.20) then
    insert into boms (name, grade, thickness, top_skin, bottom_skin, description)
    values ('Standard ACP 4mm · PE Core · 0.25 / 0.20', 'PE', 4.0, 0.25, 0.20, 'Standard exterior & interior 4mm ACP panel with low-density polyethylene core.')
    returning id into v_b1;

    insert into bom_items (bom_id, layer_type, layer_name, category, default_mat_id, qty_per_m2, uom, scrap_pct, calc_formula, sort_order)
    values
      (v_b1, 'TOP_COIL',      'PVDF Top Aluminum Coil (0.25mm)',  'RM',         v_top_id,  0.678, 'KG', 2.0, 'Area × 0.25mm × 2.71 kg/m²', 10),
      (v_b1, 'BOTTOM_COIL',   'Mill Finish Bottom Coil (0.20mm)', 'RM',         v_bot_id,  0.542, 'KG', 2.0, 'Area × 0.20mm × 2.71 kg/m²', 20),
      (v_b1, 'CORE',          'LDPE Core Granules (3.55mm)',      'GRANULE',    v_core_id, 3.266, 'KG', 3.0, 'Area × 3.55mm × 0.92 g/cm³', 30),
      (v_b1, 'ADHESIVE_FILM', 'Polymer Adhesive Film (Top+Bottom)','CONSUMABLE', v_adh_id,  0.090, 'KG', 1.0, '2 bonding layers × ~45g/m²',  40),
      (v_b1, 'MASKING_FILM',  'Protective PE Masking Film',       'CONSUMABLE', null,      1.020, 'M2', 2.0, 'Surface area + edge overlap',   50);
  end if;

  -- 2. Fire-Rated ACP 4mm FR-B1 (0.50 / 0.50)
  if not exists (select 1 from boms where grade = 'FR-B1' and thickness = 4.0 and top_skin = 0.50 and bottom_skin = 0.50) then
    insert into boms (name, grade, thickness, top_skin, bottom_skin, description)
    values ('Fire-Rated ACP 4mm · FR-B1 Core · 0.50 / 0.50', 'FR-B1', 4.0, 0.50, 0.50, 'High-specification facade panel meeting civil defense fire retardant requirements.')
    returning id into v_b2;

    insert into bom_items (bom_id, layer_type, layer_name, category, default_mat_id, qty_per_m2, uom, scrap_pct, calc_formula, sort_order)
    values
      (v_b2, 'TOP_COIL',      'PVDF Top Aluminum Coil (0.50mm)',  'RM',         v_top_id,  1.355, 'KG', 2.0, 'Area × 0.50mm × 2.71 kg/m²', 10),
      (v_b2, 'BOTTOM_COIL',   'Service Coated Bottom Coil 0.50mm','RM',         v_bot_id,  1.355, 'KG', 2.0, 'Area × 0.50mm × 2.71 kg/m²', 20),
      (v_b2, 'CORE',          'FR-B1 Mineral Flame Core (3.00mm)','GRANULE',    null,      4.800, 'KG', 3.0, 'Area × 3.00mm × 1.60 g/cm³', 30),
      (v_b2, 'ADHESIVE_FILM', 'High-Bond Adhesive Film',          'CONSUMABLE', v_adh_id,  0.100, 'KG', 1.0, '2 heavy bonding layers',        40),
      (v_b2, 'MASKING_FILM',  'Protective PE Masking Film (UV)',  'CONSUMABLE', null,      1.020, 'M2', 2.0, 'Surface area + edge overlap',   50);
  end if;

  -- 3. Signage ACP 3mm PE (0.20 / 0.20)
  if not exists (select 1 from boms where grade = 'PE' and thickness = 3.0 and top_skin = 0.20 and bottom_skin = 0.20) then
    insert into boms (name, grade, thickness, top_skin, bottom_skin, description)
    values ('Signage & Display ACP 3mm · PE Core · 0.20 / 0.20', 'PE', 3.0, 0.20, 0.20, 'Economical lightweight 3mm panel for digital print, signage and partition work.')
    returning id into v_b3;

    insert into bom_items (bom_id, layer_type, layer_name, category, default_mat_id, qty_per_m2, uom, scrap_pct, calc_formula, sort_order)
    values
      (v_b3, 'TOP_COIL',      'Polyester Top Coil (0.20mm)',      'RM',         v_top_id,  0.542, 'KG', 2.0, 'Area × 0.20mm × 2.71 kg/m²', 10),
      (v_b3, 'BOTTOM_COIL',   'Mill Finish Bottom Coil (0.20mm)', 'RM',         v_bot_id,  0.542, 'KG', 2.0, 'Area × 0.20mm × 2.71 kg/m²', 20),
      (v_b3, 'CORE',          'Recycled LDPE Core (2.60mm)',      'GRANULE',    v_core_id, 2.392, 'KG', 3.0, 'Area × 2.60mm × 0.92 g/cm³', 30),
      (v_b3, 'ADHESIVE_FILM', 'Polymer Adhesive Film',            'CONSUMABLE', v_adh_id,  0.080, 'KG', 1.0, '2 bonding layers',              40),
      (v_b3, 'MASKING_FILM',  'Protective PE Masking Film',       'CONSUMABLE', null,      1.020, 'M2', 2.0, 'Surface area + edge overlap',   50);
  end if;
end $$;
