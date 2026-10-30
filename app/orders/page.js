import Link from 'next/link'
import { QUEUE_MINE, batchQueues, db, fetchOrder, filterOrders, findOrder, myWorkIds, orderCounts, orderHistory, requireRole } from '@/lib/server'
import { can } from '@/lib/tas'
import { IntentLink, LinkBusy } from '../ui'
import OrdersView from './OrdersView'

// Workflow pipeline stages shown as tabs: from quote creation to final tax invoice.
const STAGES = [
  { status: 'PENDING', label: '1. To approve', icon: 'ph-hourglass' },
  { status: 'AWAIT_DISPATCH', label: '2. In production', icon: 'ph-package' },
  { status: 'AWAIT_DO', label: '3. Ready to ship', icon: 'ph-truck' },
  { status: 'AWAIT_PI', label: '4. Make PI', icon: 'ph-receipt' },
  { status: 'AWAIT_TAX', label: '5. Tax invoice', icon: 'ph-upload-simple' },
]

// Secondary filters in the dropdown menu for admin / manager:
const FILTERS = [
  { status: 'APPROVED', label: 'Approved', icon: 'ph-seal-check' },
  { status: 'REJECTED', label: 'Rejected', icon: 'ph-x-circle' },
  { status: 'CANCELLED', label: 'Cancelled', icon: 'ph-prohibit' },
]

const TITLES = {
  MINE: 'My work',
  ACTIVE: 'All active',
  '': 'All orders',
  ...Object.fromEntries(STAGES.map((s) => [s.status, s.label])),
  ...Object.fromEntries(FILTERS.map((f) => [f.status, f.label])),
}
const PAGE = 100
// Lists whose filter also reads the DO/PI batches (batchQueues()).
const BATCH_LISTS = ['ACTIVE', 'AWAIT_PI', 'AWAIT_TAX']
// ?sort= values: column -> [order column, ascending]
const SORTS = { newest: ['id', false], oldest: ['id', true], customer: ['customer_name', true], customer_desc: ['customer_name', false] }

// Tab title: the open order's quote no, else the list name.
export async function generateMetadata({ searchParams }) {
  const sp = await searchParams
  const o = sp.view ? await findOrder(sp.view, await requireRole()) : null
  if (o?.quote_no) return { title: o.quote_no }
  return { title: TITLES[sp.status] || 'Orders' }
}

export default async function Orders({ searchParams }) {
  const sp = await searchParams
  const statusParam = TITLES[sp.status] && sp.status !== 'MINE' ? sp.status : ''
  const everything = !statusParam && sp.show === 'all'

  const viewId = /^\d+$/.test(sp.view || '') ? sp.view : null
  // Start user check, queues, counts and order details concurrently.
  // myWorkIds, orderCounts and view start as soon as me resolves (no sequential 3-round waterfall).
  const mePromise = requireRole()
  const minePromise = mePromise.then((me) => myWorkIds(me.role))
  const countsPromise = mePromise.then((me) => orderCounts(me.role === 'sales' ? me.id : null))
  const batchPromise = BATCH_LISTS.includes(statusParam) || (!statusParam && !everything) ? batchQueues() : Promise.resolve(null)
  const historyPromise = viewId ? orderHistory(viewId) : Promise.resolve(null)
  const viewPromise = viewId ? mePromise.then((me) => findOrder(viewId, me)) : Promise.resolve(null)

  const [me, mine, b] = await Promise.all([mePromise, minePromise, batchPromise])
  // No list asked for: My Work for a single-job role, else All Active.
  const home = mine ? 'MINE' : 'ACTIVE'
  const status = statusParam || (everything ? '' : home)
  const term = String(sp.q || '').replace(/[,()*%]/g, '').trim()
  const page = Math.max(1, parseInt(sp.page) || 1)
  const sort = SORTS[sp.sort] ? sp.sort : 'newest'
  const own = (q) => (me.role === 'sales' ? q.eq('salesperson_id', me.id) : q)

  const base = own(db().from('orders')
    .select('id, quote_no, quote_date, customer_name, customer_code, contact_no, vat_no, cr_no, address, salesperson_name, status, dispatch_status, doc_no, do_date, pi_date, tax_invoice_path, transport, vat_rate, action_by, action_at, reject_reason, short_close_reason, notes, items:order_items(id, item_no, description, qty, price, total, delivered_qty, ready_qty, dispatched_qty, color_name, m2, production_status, coil_date), batches:order_batches(id, batch_no, do_no, do_date, pi_no, pi_date, tax_invoice_path, vehicle_no, driver, transport, items:batch_items(id, do_qty, order_item:order_items(description, price)))')
    .order(SORTS[sort][0], { ascending: SORTS[sort][1] }).order('id', { ascending: false }).range((page - 1) * PAGE, page * PAGE))
  let q = status === 'MINE' ? QUEUE_MINE(base, mine) : filterOrders(base, status, b)
  if (term) q = q.or(`quote_no.ilike.%${term}%,customer_name.ilike.%${term}%,doc_no.ilike.%${term}%`)

  const [{ data: orders, error }, c, view, history] = await Promise.all([
    q,
    countsPromise,
    viewPromise,
    historyPromise,
  ])
  const countOf = (s) => (s === 'MINE' ? mine.length : c[s || 'ALL']) ?? 0
  const more = orders?.length > PAGE
  const rows = orders?.slice(0, PAGE)
  rows?.forEach((o) => o.items.sort((a, b) => a.item_no - b.item_no))

  // The list's own URL part: nothing for the home list.
  const listOf = (s) => (s === home ? {} : s ? { status: s } : { show: 'all' })
  const keep = { ...(term && { q: term }), ...(sort !== 'newest' && { sort }) }
  const list = { ...listOf(status), ...keep, ...(page > 1 && { page }) }
  const href = (params) => `/orders${Object.keys(params).length ? `?${new URLSearchParams(params)}` : ''}`
  const pageHref = (n) => href({ ...list, page: n })
  const viewHref = (id) => href({ ...list, view: id })
  const listHref = href(list)

  // Column header that sorts the list (first page)
  const sortHref = (k) => href({ ...listOf(status), ...(term && { q: term }), ...(k !== 'newest' && { sort: k }) })
  const sortKeys = Object.keys(SORTS).flatMap((k) => [k, `${k}_desc`]).concat(['newest', 'oldest'])
  const sortHrefs = Object.fromEntries(sortKeys.map((k) => [k, sortHref(k)]))
  const tabs = [
    mine && ['MINE', 'ph-user'],
    ['ACTIVE', 'ph-lightning'],
    ...STAGES.map((s) => [s.status, s.icon]),
    ['', 'ph-list-checks'],
  ].filter(Boolean)
  const boss = ['admin', 'manager'].includes(me.role)
  const filter = FILTERS.find((f) => f.status === status)
  const exportParams = new URLSearchParams({ ...(filter ? { status } : {}), ...(term ? { q: term } : {}) })

  return (
    <>
      <div className="card">
        <div className="tbl-top">
          <nav className="tabs tabs-dynamic mb-0" aria-label="Which orders">
            {tabs.map(([k, icon]) => {
              const isActive = status === k
              const title = TITLES[k]
              const count = countOf(k)
              return (
                <IntentLink
                  key={k}
                  href={href({ ...listOf(k), ...keep })}
                  className={`tab${isActive ? ' on' : ''}`}
                  aria-current={isActive ? 'page' : undefined}
                  title={`${title} (${count})`}
                  aria-label={`${title} (${count})`}
                >
                  <LinkBusy />
                  <i className={`ph ${icon}`} />
                  <span className="tab-txt">{title}</span>
                  <span className="badge b-none">{count}</span>
                </IntentLink>
              )
            })}
          </nav>
          <div className="tbl-filters">
            {boss && (
              // key: picking a list closes the menu
              <details className="dl-menu q-menu" key={status}>
                <summary
                  className={`btn btn-sm ${filter ? 'btn-primary' : 'btn-ghost'}`}
                  title={filter ? `Filter: ${filter.label}` : 'More filters'}
                  aria-label={filter ? `Filter: ${filter.label}` : 'More filters'}
                >
                  <i className="ph ph-funnel" />
                  <span className="q-label">{filter?.label || 'More filters'}</span>
                  <i className="ph ph-caret-down q-caret" />
                </summary>
                <div className="dl-list">
                  {FILTERS.map((f) => (
                    <IntentLink key={f.status} href={href({ status: f.status, ...keep })} className="dl-item">
                      <i className={`ph ${f.icon}`} />{f.label}<span className="badge b-none" style={{ marginLeft: 'auto' }}>{countOf(f.status)}</span>
                    </IntentLink>
                  ))}
                </div>
              </details>
            )}
            <form className="sw">
              {Object.entries(listOf(status)).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
              <i className="ph ph-magnifying-glass" />
              <input className="tsearch" name="q" defaultValue={term} placeholder="Quote no, customer, DO/PI no" aria-label="Search this list" />
            </form>
            {boss && (
              <a className="btn btn-ghost btn-sm" href={`/admin/export/orders?${exportParams}`}>
                <i className="ph ph-download-simple" />Export
              </a>
            )}
            {can(me, 'sales') && (
              <IntentLink href="/orders/new" className="btn btn-primary btn-sm fab-phone">
                <LinkBusy /><i className="ph ph-plus" />New quotation
              </IntentLink>
            )}
          </div>
        </div>
        {error && <div className="banner error" style={{ margin: '0 20px 16px' }} title={error.message}><i className="ph ph-warning-circle" />Couldn't load the orders. Press Refresh to try again; if it keeps failing, tell the admin.</div>}
        <OrdersView
          rows={rows}
          initialView={view}
          initialHistory={history}
          me={me}
          listHref={listHref}
          openBatchPi={sp.open_batch_pi}
          sort={sort}
          term={term}
          sortHrefs={sortHrefs}
          SORTS={SORTS}
        />
        {(page > 1 || more) && (
          <div className="tbl-foot center">
            {page > 1 && <Link prefetch={false} className="btn btn-ghost btn-sm" href={pageHref(page - 1)}><LinkBusy /><i className="ph ph-caret-left" />{sort === 'newest' ? 'Newer' : 'Previous'}</Link>}
            <span className="spacer muted text-sm c">Page {page}</span>
            {more && <Link prefetch={false} className="btn btn-ghost btn-sm" href={pageHref(page + 1)}><LinkBusy />{sort === 'newest' ? 'Older' : 'Next'}<i className="ph ph-caret-right" /></Link>}
          </div>
        )}
      </div>
    </>
  )
}
