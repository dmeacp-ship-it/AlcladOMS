-- migrate-010: Item master as simple lists (like the Google Sheet), not every combination.
-- One row per value of each list; colour keeps its code + name together. The quote combines them.
-- Run in Supabase -> SQL Editor. Removes the 3,800 combination rows from `items`
-- (existing orders keep their own copy of every line, so they don't change).
create table if not exists item_lists (
  id    bigint generated always as identity primary key,
  list  text not null check (list in ('brand', 'color', 'grade', 'core', 'skin', 'width', 'length', 'thickness', 'uom')),
  value text not null,          -- for colour: the colour code
  name  text,                   -- colour name (colour list only)
  unique (list, value)
);
alter table item_lists enable row level security;

-- Start from the values in use today, so quoting keeps working until the new master is uploaded.
insert into item_lists (list, value, name)
select 'brand', brand, null from items where brand is not null group by brand
union all select 'grade', grade, null from items where grade is not null group by grade
union all select 'core', core, null from items where core is not null group by core
union all select 'skin', skin::text, null from items where skin is not null group by skin
union all select 'width', width::text, null from items where width is not null group by width
union all select 'length', length::text, null from items where length is not null group by length
union all select 'thickness', thickness::text, null from items where thickness is not null group by thickness
union all select 'uom', uom, null from items where uom is not null group by uom
union all select distinct on (color_code) 'color', color_code, color_name from items where color_code is not null
on conflict do nothing;

delete from items;

-- Pick-lists for the quotation form, now read from item_lists (same shape as before).
create or replace function item_options() returns json language sql stable as $$
  select json_build_object(
    'brand',     (select json_agg(value order by value) from item_lists where list = 'brand'),
    'grade',     (select json_agg(value order by value) from item_lists where list = 'grade'),
    'core',      (select json_agg(value order by value) from item_lists where list = 'core'),
    'skin',      (select json_agg(value order by value::numeric) from item_lists where list = 'skin'),
    'width',     (select json_agg(value order by value::numeric) from item_lists where list = 'width'),
    'length',    (select json_agg(value order by value::numeric) from item_lists where list = 'length'),
    'thickness', (select json_agg(value order by value::numeric) from item_lists where list = 'thickness'),
    'uom',       (select json_agg(value order by value) from item_lists where list = 'uom'),
    'color',     (select json_object_agg(value, coalesce(name, '')) from item_lists where list = 'color')
  )
$$;
revoke execute on function item_options() from public, anon, authenticated;
