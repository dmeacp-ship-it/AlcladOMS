-- migrate-006: DO/PI numbers without slashes (DO-CUS-115-231026-01). Run in Supabase -> SQL Editor.
create or replace function assign_batch_no(p_batch bigint, p_kind text) returns text language plpgsql as $$
declare
  v_no     text;
  v_code   text;
  v_prefix text;
  v_seq    int;
  v_date_str text;
begin
  perform pg_advisory_xact_lock(hashtext('batch_no'));

  -- Check existing number
  if p_kind = 'DO' then
    select do_no into v_no from order_batches where id = p_batch;
    if v_no is not null then return v_no; end if;
  elsif p_kind = 'PI' then
    select pi_no into v_no from order_batches where id = p_batch;
    if v_no is not null then return v_no; end if;
  else
    raise exception 'p_kind must be DO or PI';
  end if;

  -- Get customer code
  select coalesce(o.customer_code, 'CUS') into v_code
    from orders o
    join order_batches b on b.order_id = o.id
   where b.id = p_batch;

  v_date_str := to_char(now() at time zone 'Asia/Riyadh', 'DDMMYY');
  v_prefix := p_kind || '-' || v_code || '-' || v_date_str || '-';

  if p_kind = 'DO' then
    select coalesce(max(substring(do_no from length(v_prefix) + 1)::int), 0) + 1 into v_seq
      from order_batches
     where left(do_no, length(v_prefix)) = v_prefix;
    v_no := v_prefix || lpad(v_seq::text, 2, '0');
    update order_batches set do_no = v_no where id = p_batch;
  else
    -- For PI, check if there is a matching sequence from the batch's DO or next available PI of that day
    select coalesce(max(substring(pi_no from length(v_prefix) + 1)::int), 0) + 1 into v_seq
      from order_batches
     where left(pi_no, length(v_prefix)) = v_prefix;
    v_no := v_prefix || lpad(v_seq::text, 2, '0');
    update order_batches set pi_no = v_no where id = p_batch;
  end if;

  return v_no;
end $$;

update order_batches set do_no = replace(do_no, '/', ''), pi_no = replace(pi_no, '/', '');
update orders set doc_no = replace(doc_no, '/', '') where doc_no like '%/%';
