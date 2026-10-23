-- migrate-009: every order count the sidebar badges and the Orders tiles need, in one query.
-- Run in Supabase -> SQL Editor. Until it runs, the app counts the old way (one query per number).
-- The filters mirror QUEUES in lib/server.js: change both together.
create or replace function order_counts(p_salesperson uuid default null) returns json language sql stable as $$
  select json_build_object(
    'ALL',            count(*),
    'PENDING',        count(*) filter (where status = 'PENDING'),
    'APPROVED',       count(*) filter (where status = 'APPROVED'),
    'REJECTED',       count(*) filter (where status = 'REJECTED'),
    'CANCELLED',      count(*) filter (where status = 'CANCELLED'),
    'ACTIVE',         count(*) filter (where status in ('PENDING', 'APPROVED')
                        and (pi_date is null or do_date is null or tax_invoice_path is null or dispatch_status in ('PENDING', 'PARTIAL'))),
    'AWAIT_DO',       count(*) filter (where status = 'APPROVED' and do_date is null),
    'AWAIT_DISPATCH', count(*) filter (where status = 'APPROVED' and dispatch_status in ('PENDING', 'PARTIAL')),
    'AWAIT_PI',       count(*) filter (where status = 'APPROVED' and do_date is not null and pi_date is null),
    'AWAIT_TAX',      count(*) filter (where status = 'APPROVED' and pi_date is not null and tax_invoice_path is null)
  )
  from orders
  where p_salesperson is null or salesperson_id = p_salesperson
$$;
revoke execute on function order_counts(uuid) from public, anon, authenticated;
