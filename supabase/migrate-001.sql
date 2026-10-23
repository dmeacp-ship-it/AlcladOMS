-- Run once in Supabase -> SQL Editor on a database created from the ORIGINAL schema.sql.
-- (A fresh install from the current schema.sql already includes all of this.)

alter table orders drop constraint orders_status_check;
alter table orders add constraint orders_status_check
  check (status in ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'));
alter table orders add column do_by text, add column pi_by text, add column price_note text;

create or replace function assign_doc_no(p_order bigint) returns text language plpgsql as $$
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

-- DN and PI are each one transaction: header, every line and the number, or nothing.
-- p_lines: [{"id": 1, "qty": 10, "m2": 2.5}, ...]
create or replace function generate_do(p_order bigint, p_lines jsonb, p_by text) returns text language plpgsql as $$
begin
  update orders set do_date = (now() at time zone 'Asia/Riyadh')::date, do_by = p_by
   where id = p_order and status = 'APPROVED' and do_date is null and pi_date is not null;
  if not found then raise exception 'A Delivery Note already exists, or the order has no Proforma Invoice yet.'; end if;
  update order_items i set delivered_qty = (l->>'qty')::numeric, delivered_m2 = (l->>'m2')::numeric
    from jsonb_array_elements(p_lines) l
   where i.id = (l->>'id')::bigint and i.order_id = p_order;
  return assign_doc_no(p_order);
end $$;

-- p_lines: [{"id": 1, "qty": 10, "m2": 2.5, "price": 40, "total": 100}, ...]
create or replace function generate_pi(p_order bigint, p_lines jsonb, p_by text, p_note text) returns text language plpgsql as $$
begin
  update orders set pi_date = (now() at time zone 'Asia/Riyadh')::date, pi_by = p_by, price_note = p_note
   where id = p_order and status = 'APPROVED' and pi_date is null;
  if not found then raise exception 'A Proforma Invoice already exists, or the order is not approved.'; end if;
  update order_items i set invoiced_qty = (l->>'qty')::numeric, invoiced_m2 = (l->>'m2')::numeric,
         invoiced_price = (l->>'price')::numeric, invoiced_total = (l->>'total')::numeric
    from jsonb_array_elements(p_lines) l
   where i.id = (l->>'id')::bigint and i.order_id = p_order;
  return assign_doc_no(p_order);
end $$;

revoke execute on function assign_doc_no(bigint)              from public, anon, authenticated;
revoke execute on function generate_do(bigint, jsonb, text)    from public, anon, authenticated;
revoke execute on function generate_pi(bigint, jsonb, text, text) from public, anon, authenticated;
