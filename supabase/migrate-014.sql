-- migrate-014: faster page loads (performance audit, 25 Oct 2026). Run in Supabase -> SQL Editor. Optional:
-- until it runs, the app counts plant lines and reads activity filters itself (slower as the data grows).

-- 1. order_counts() also returns LINES: order lines the plant still has to dispatch (the Plant Dispatch badge),
--    so the layout no longer downloads every approved line to count it. V = 3 says LINES is there.
--    LINES ignores p_salesperson: the plant works on every order. The rest mirrors QUEUES in lib/server.js.
create or replace function order_counts(p_salesperson uuid default null) returns json language sql stable as $$
  with o as (
    select o.*,
      exists (select 1 from order_batches b where b.order_id = o.id and b.do_date is not null and b.pi_no is null) as batch_pi,
      exists (select 1 from order_batches b where b.order_id = o.id and b.pi_no is not null and b.tax_invoice_path is null) as batch_tax
    from orders o
    where p_salesperson is null or o.salesperson_id = p_salesperson
  )
  select json_build_object(
    'V',              3,
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
    'AWAIT_TAX',      count(*) filter (where status = 'APPROVED' and ((pi_date is not null and tax_invoice_path is null) or batch_tax)),
    'LINES',          (select count(*) from order_items i join orders x on x.id = i.order_id
                        where x.status = 'APPROVED' and x.dispatch_status is distinct from 'SHORT_CLOSED'
                          and i.qty > coalesce(i.dispatched_qty, 0))
  )
  from o
$$;
revoke execute on function order_counts(uuid) from public, anon, authenticated;

-- 2. Plant Dispatch tab counts in one call instead of five. Mirrors SHOWS in app/plant/page.js; a search matches
--    the material, or the order's quote no, DO no or customer.
create or replace function plant_counts(p_term text default null) returns json language sql stable as $$
  select json_build_object(
    'open',    count(*) filter (where bal > 0),
    'ready',   count(*) filter (where bal > 0 and ready > 0),
    'pending', count(*) filter (where bal > 0 and sent = 0 and ready <= 0),
    'partial', count(*) filter (where bal > 0 and sent > 0),
    'done',    count(*) filter (where bal <= 0)
  )
  from (
    select i.balance_qty as bal, i.ready_qty as ready, i.dispatched_qty as sent
    from order_items i join orders o on o.id = i.order_id
    where o.status = 'APPROVED' and o.dispatch_status is distinct from 'SHORT_CLOSED'
      and (coalesce(p_term, '') = '' or i.description ilike '%' || p_term || '%' or o.quote_no ilike '%' || p_term || '%'
           or o.doc_no ilike '%' || p_term || '%' or o.customer_name ilike '%' || p_term || '%')
  ) l
$$;
revoke execute on function plant_counts(text) from public, anon, authenticated;

-- 3. The Activity log's two filter lists (who did something, which actions exist), instead of reading the
--    latest 5,000 events on every visit.
create or replace function activity_filters() returns json language sql stable as $$
  select json_build_object(
    'users',   (select coalesce(json_agg(by_name order by by_name), '[]') from (select distinct by_name from order_events where by_name is not null) u),
    'actions', (select coalesce(json_agg(action order by action), '[]') from (select distinct action from order_events where action is not null) a)
  )
$$;
revoke execute on function activity_filters() from public, anon, authenticated;
