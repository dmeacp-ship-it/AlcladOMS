-- migrate-016: clearer "not enough stock" message (27 Oct 2026). Run in Supabase -> SQL Editor.
-- Before: "Not enough X in Store: that would leave -100.000 in stock."  After: "Not enough X in Store: 100 KG short."

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

revoke execute on function check_stock(jsonb) from public, anon, authenticated;
