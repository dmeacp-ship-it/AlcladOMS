-- Run once in Supabase -> SQL Editor (after migrate-001.sql).
-- Flow order is now: Quotation -> Approval -> Delivery Order (DO) -> Proforma Invoice (PI) -> tax invoice.
-- (A fresh install from the current schema.sql already includes this.)

create or replace function generate_do(p_order bigint, p_lines jsonb, p_by text) returns text language plpgsql as $$
begin
  update orders set do_date = (now() at time zone 'Asia/Riyadh')::date, do_by = p_by
   where id = p_order and status = 'APPROVED' and do_date is null;
  if not found then raise exception 'A Delivery Order already exists, or the order is not approved.'; end if;
  update order_items i set delivered_qty = (l->>'qty')::numeric, delivered_m2 = (l->>'m2')::numeric
    from jsonb_array_elements(p_lines) l
   where i.id = (l->>'id')::bigint and i.order_id = p_order;
  return assign_doc_no(p_order);
end $$;

create or replace function generate_pi(p_order bigint, p_lines jsonb, p_by text, p_note text) returns text language plpgsql as $$
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

revoke execute on function generate_do(bigint, jsonb, text)       from public, anon, authenticated;
revoke execute on function generate_pi(bigint, jsonb, text, text) from public, anon, authenticated;
