-- migrate-013: order counts that look at every DO batch, not only the order's first PI / latest tax invoice.
-- Run in Supabase -> SQL Editor. Optional: until it runs, the app counts the PI, tax and active queues itself
-- (a few extra queries per page). The filters mirror QUEUES in lib/server.js: change both together.
create or replace function order_counts(p_salesperson uuid default null) returns json language sql stable as $$
  with o as (
    select o.*,
      exists (select 1 from order_batches b where b.order_id = o.id and b.do_date is not null and b.pi_no is null) as batch_pi,
      exists (select 1 from order_batches b where b.order_id = o.id and b.pi_no is not null and b.tax_invoice_path is null) as batch_tax
    from orders o
    where p_salesperson is null or o.salesperson_id = p_salesperson
  )
  select json_build_object(
    'V',              2,
    'ALL',            count(*),
    'PENDING',        count(*) filter (where status = 'PENDING'),
    'APPROVED',       count(*) filter (where status = 'APPROVED'),
    'REJECTED',       count(*) filter (where status = 'REJECTED'),
    'CANCELLED',      count(*) filter (where status = 'CANCELLED'),
    'ACTIVE',         count(*) filter (where status = 'PENDING' or (status = 'APPROVED'
                        and (pi_date is null or do_date is null or tax_invoice_path is null
                             or dispatch_status in ('PENDING', 'PARTIAL') or batch_pi or batch_tax))),
    'AWAIT_DO',       count(*) filter (where status = 'APPROVED' and do_date is null),
    'AWAIT_DISPATCH', count(*) filter (where status = 'APPROVED' and dispatch_status in ('PENDING', 'PARTIAL')),
    'AWAIT_PI',       count(*) filter (where status = 'APPROVED' and ((do_date is not null and pi_date is null) or batch_pi)),
    'AWAIT_TAX',      count(*) filter (where status = 'APPROVED' and ((pi_date is not null and tax_invoice_path is null) or batch_tax))
  )
  from o
$$;
revoke execute on function order_counts(uuid) from public, anon, authenticated;
