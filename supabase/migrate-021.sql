-- 1510 mm SUPER HIGH SS10+ protective film (ALCLAD and ALUMAX), for 1500 mm panels in SUPER HIGH colours.
-- Copied from the 1510 mm HIGH film of the same brand (same kind, size, UoM and cost); edit the cost after.
-- Safe to run twice.
insert into materials (code, name, category, kind, mat_type, color_code, thickness, width, uom, cost_price, min_level, max_level)
select replace(code, '-HIGH', '-SUPER HIGH SS10+'), replace(name, '-HIGH', '-SUPER HIGH SS10+'),
       category, kind, mat_type, color_code, thickness, width, uom, cost_price, min_level, max_level
  from materials
 where code in ('PROTECTIVE FILM-ALCLAD-0.080*1510-HIGH', 'PROTECTIVE FILM-ALUMAX-0.080*1510-HIGH')
   and not exists (select 1 from materials m where m.code = replace(materials.code, '-HIGH', '-SUPER HIGH SS10+'));
