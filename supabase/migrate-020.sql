-- migrate-020: Option B — Auto-Issue on Production (DPR) & Planning (31 Oct 2026)
-- Automatically transfers raw materials from the plant's Main RM Store to the Line (WIP Store)
-- based on actual consumption (in DPR) or BOM requirements (in Plan) when line stock is insufficient.
-- Run in Supabase -> SQL Editor after migrate-019. Safe to run again.

-- 1. Auto-issue for a Production Plan.
-- The app works out what the plan needs with the parametric BOM (lib/bom.js calcDprBOM) and passes the
-- totals in p_lines = [{ "material": id, "qty": n }, ...]. The old static boms / bom_items tables have no
-- materials linked (default_mat_id is null), so this function never reads them.
-- One transaction: only the shortfall on the line is moved, the transfer is linked to the plan, and the
-- RM store must cover it (check_stock), or nothing is saved.
drop function if exists auto_issue_plan(bigint, text);
create or replace function auto_issue_plan(p_plan_id bigint, p_lines jsonb, p_by text)
returns text language plpgsql as $$
declare
  v_plan record;
  v_rm_store bigint;
  v_transfer_id bigint;
  v_iss_no text;
  v_stock_keys jsonb := '[]'::jsonb;
  rec record;
  v_curr_stock numeric;
  v_shortfall numeric;
begin
  select p.id, p.plan_no, p.plan_date, p.line_store_id, p.status, s.plant_code
    into v_plan
    from production_plans p
    join stores s on s.id = p.line_store_id
   where p.id = p_plan_id;
  if not found then raise exception 'Plan not found.'; end if;
  if v_plan.status <> 'OPEN' then raise exception 'Plan % is not open.', v_plan.plan_no; end if;

  select s.id into v_rm_store
    from stores s
   where s.plant_code = v_plan.plant_code and s.type = 'RM'
   order by s.id asc limit 1;
  if v_rm_store is null then raise exception 'No RM store found for plant %.', v_plan.plant_code; end if;

  perform lock_stock();

  for rec in
    select (l->>'material')::bigint as material_id, sum((l->>'qty')::numeric) as needed_qty
      from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) l
     where nullif(l->>'material', '') is not null and coalesce((l->>'qty')::numeric, 0) > 0
     group by 1
  loop
    select coalesce(sum(qty), 0) into v_curr_stock
      from stock_moves
     where store_id = v_plan.line_store_id and material_id = rec.material_id;

    if v_curr_stock < rec.needed_qty then
      v_shortfall := round(rec.needed_qty - v_curr_stock, 3);
      if v_transfer_id is null then
        v_iss_no := next_inv_no('ISS');
        insert into transfers (doc_no, doc_date, from_store_id, to_store_id, requested_by, notes, by_name, plan_id)
        values (v_iss_no, v_plan.plan_date, v_rm_store, v_plan.line_store_id, 'Auto-issue (Plan)', 'Auto-issued for ' || v_plan.plan_no, p_by, p_plan_id)
        returning id into v_transfer_id;
      end if;

      insert into transfer_items (transfer_id, material_id, qty)
      values (v_transfer_id, rec.material_id, v_shortfall);

      insert into stock_moves (move_date, store_id, material_id, qty, ref_type, ref_no, by_name)
      values (v_plan.plan_date, v_rm_store, rec.material_id, -v_shortfall, 'ISSUE', v_iss_no, p_by);

      insert into stock_moves (move_date, store_id, material_id, qty, ref_type, ref_no, by_name)
      values (v_plan.plan_date, v_plan.line_store_id, rec.material_id, v_shortfall, 'ISSUE', v_iss_no, p_by);

      v_stock_keys := v_stock_keys || jsonb_build_object('store', v_rm_store, 'material', rec.material_id);
    end if;
  end loop;

  if v_transfer_id is null then
    return 'ALREADY_STOCKED';
  end if;

  perform check_stock(v_stock_keys);
  return v_iss_no;
end $$;

-- 2. create_production issues any shortfall from the RM store inside the same transaction, so a failed
--    production entry also undoes its material issue (the app no longer pre-transfers).
create or replace function create_production(p_head jsonb, p_items jsonb, p_usage jsonb, p_consumption jsonb default '[]'::jsonb)
returns text language plpgsql as $$
declare
  v_id bigint;
  v_no text;
  v_line bigint := (p_head->>'line')::bigint;
  v_date date := (p_head->>'date')::date;
  v_allow_neg boolean := coalesce((p_head->>'allow_negative')::boolean, false);
  v_stock_keys jsonb := '[]'::jsonb;
  v_rm_store bigint;
  v_transfer_id bigint;
  v_iss_no text;
  v_needed_keys jsonb := '[]'::jsonb;
  rec record;
  v_curr_stock numeric;
  v_shortfall numeric;
begin
  perform 1 from stores where id = v_line and type = 'WIP';
  if not found then raise exception 'Pick a production line (a WIP store).'; end if;
  perform lock_stock();

  -- Find the Main RM store for this line's plant
  select s.id into v_rm_store
    from stores s
   where s.plant_code = (select plant_code from stores where id = v_line)
     and s.type = 'RM'
   order by s.id asc
   limit 1;

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

  -- 2a. Record detailed consumption with System vs Actual
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

    -- Auto-issue from RM store to line store for any consumed material that is short on the line
    if v_rm_store is not null then
      for rec in
        select (c->>'material_id')::bigint as mat_id,
               sum(coalesce((c->>'actual_qty')::numeric, 0)) as act_qty
          from jsonb_array_elements(p_consumption) c
         where coalesce((c->>'actual_qty')::numeric, 0) > 0
         group by 1
      loop
        select coalesce(sum(qty), 0) into v_curr_stock
          from stock_moves
         where store_id = v_line and material_id = rec.mat_id;

        if v_curr_stock < rec.act_qty then
          v_shortfall := rec.act_qty - v_curr_stock;
          if v_transfer_id is null then
            v_iss_no := next_inv_no('ISS');
            insert into transfers (doc_no, doc_date, from_store_id, to_store_id, requested_by, notes, by_name, plan_id)
            values (v_iss_no, v_date, v_rm_store, v_line, 'Auto-issue (DPR)', 'Auto-issued for DPR ' || v_no, p_head->>'by', nullif(p_head->>'plan', '')::bigint)
            returning id into v_transfer_id;
          end if;

          insert into transfer_items (transfer_id, material_id, qty)
          values (v_transfer_id, rec.mat_id, v_shortfall);

          insert into stock_moves (move_date, store_id, material_id, qty, ref_type, ref_no, by_name, note)
          values (v_date, v_rm_store, rec.mat_id, -v_shortfall, 'ISSUE', v_iss_no, p_head->>'by', 'Auto-issued to line for ' || v_no);

          insert into stock_moves (move_date, store_id, material_id, qty, ref_type, ref_no, by_name, note)
          values (v_date, v_line, rec.mat_id, v_shortfall, 'ISSUE', v_iss_no, p_head->>'by', 'Auto-received on line for ' || v_no);

          v_needed_keys := v_needed_keys || jsonb_build_object('store', v_rm_store, 'material', rec.mat_id);
        end if;
      end loop;

      if not v_allow_neg and jsonb_array_length(v_needed_keys) > 0 then
        perform check_stock(v_needed_keys);
      end if;
    end if;

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

  -- 2b. Fallback to legacy p_usage if p_consumption not provided
  elsif jsonb_array_length(coalesce(p_usage, '[]'::jsonb)) > 0 then
    if v_rm_store is not null then
      for rec in
        select (u->>'material')::bigint as mat_id,
               sum(coalesce((u->>'qty')::numeric, 0)) as act_qty
          from jsonb_array_elements(p_usage) u
         where coalesce((u->>'qty')::numeric, 0) > 0
         group by 1
      loop
        select coalesce(sum(qty), 0) into v_curr_stock
          from stock_moves
         where store_id = v_line and material_id = rec.mat_id;

        if v_curr_stock < rec.act_qty then
          v_shortfall := rec.act_qty - v_curr_stock;
          if v_transfer_id is null then
            v_iss_no := next_inv_no('ISS');
            insert into transfers (doc_no, doc_date, from_store_id, to_store_id, requested_by, notes, by_name, plan_id)
            values (v_iss_no, v_date, v_rm_store, v_line, 'Auto-issue (DPR)', 'Auto-issued for DPR ' || v_no, p_head->>'by', nullif(p_head->>'plan', '')::bigint)
            returning id into v_transfer_id;
          end if;

          insert into transfer_items (transfer_id, material_id, qty)
          values (v_transfer_id, rec.mat_id, v_shortfall);

          insert into stock_moves (move_date, store_id, material_id, qty, ref_type, ref_no, by_name, note)
          values (v_date, v_rm_store, rec.mat_id, -v_shortfall, 'ISSUE', v_iss_no, p_head->>'by', 'Auto-issued to line for ' || v_no);

          insert into stock_moves (move_date, store_id, material_id, qty, ref_type, ref_no, by_name, note)
          values (v_date, v_line, rec.mat_id, v_shortfall, 'ISSUE', v_iss_no, p_head->>'by', 'Auto-received on line for ' || v_no);

          v_needed_keys := v_needed_keys || jsonb_build_object('store', v_rm_store, 'material', rec.mat_id);
        end if;
      end loop;

      if not v_allow_neg and jsonb_array_length(v_needed_keys) > 0 then
        perform check_stock(v_needed_keys);
      end if;
    end if;

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

  -- 2c. Validate stock on the line
  if not v_allow_neg and v_stock_keys is not null and jsonb_array_length(v_stock_keys) > 0 then
    perform check_stock(v_stock_keys);
  end if;

  return v_no;
end $$;

-- 3. Only the server (service role) may call these, like every other stock function.
revoke execute on function auto_issue_plan(bigint, jsonb, text) from public, anon, authenticated;
revoke execute on function create_production(jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
