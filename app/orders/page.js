import Link from 'next/link'
import { QUEUE_MINE, batchQueues, db, fetchOrder, filterOrders, findOrder, myWorkIds, orderCounts, orderHistory, requireRole } from '@/lib/server'
import { DISPATCH, STATUS, actionData, day, int, money, plural, totals } from '@/lib/tas'
import { ClickRow, DocsMenu, LinkBusy } from '../ui'
import OrderDialog from './OrderDialog'
import OrderActions from './OrderActions'

// Lists people pick most: My Work (only roles with one job), All Active, Everything. The work queues and old
// statuses are in one Filter menu for admin / manager.
const FILTERS = [
  { status: 'PENDING', label: 'Waiting for approval', icon: 'ph-hourglass' },
  { status: 'AWAIT_DO', label: 'No Delivery Order yet', icon: 'ph-truck' },
  { status: 'AWAIT_DISPATCH', label: 'Not fully shipped', icon: 'ph-package' },
  { status: 'AWAIT_PI', label: 'Waiting for PI', icon: 'ph-receipt' },
  { status: 'AWAIT_TAX', label: 'Waiting for tax invoice', icon: 'ph-upload-simple' },
  { status: 'APPROVED', label: 'Approved', icon: 'ph-seal-check' },
  { status: 'REJECTED', label: 'Rejected', icon: 'ph-x-circle' },
  { status: 'CANCELLED', label: 'Cancelled', icon: 'ph-prohibit' },
]
const TITLES = { MINE: 'My Work', ACTIVE: 'All Active', '': 'Everything', ...Object.fromEntries(FILTERS.map((f) => [f.status, f.label])) }
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
  // Everything that doesn't depend on who is signed in starts with the user check (one round trip):
  // the open order and its history (shown only if findOrder allows it), and the batch queues for the lists that need them.
  const [me, b, , history] = await Promise.all([
    requireRole(),
    BATCH_LISTS.includes(statusParam) || (!statusParam && !everything) ? batchQueues() : null,
    viewId && fetchOrder(viewId),
    viewId && orderHistory(viewId),
  ])
  // No list asked for: My Work for a single-job role, else All Active. (The sidebar badge already asked, cached.)
  const mine = await myWorkIds(me.role)
  const home = mine ? 'MINE' : 'ACTIVE'
  const status = statusParam || (everything ? '' : home)
  const term = String(sp.q || '').replace(/[,()*%]/g, '').trim()
  const page = Math.max(1, parseInt(sp.page) || 1)
  const sort = SORTS[sp.sort] ? sp.sort : 'newest'
  const own = (q) => (me.role === 'sales' ? q.eq('salesperson_id', me.id) : q)

  const base = own(db().from('orders')
    .select('id, quote_no, quote_date, customer_name, salesperson_name, status, dispatch_status, doc_no, do_date, pi_date, tax_invoice_path, transport, vat_rate, items:order_items(id, item_no, description, qty, total, delivered_qty, ready_qty, dispatched_qty), batches:order_batches(id, batch_no, do_no, do_date, pi_no, pi_date, tax_invoice_path, items:batch_items(id, do_qty, order_item:order_items(description, price)))')
    .order(SORTS[sort][0], { ascending: SORTS[sort][1] }).order('id', { ascending: false }).range((page - 1) * PAGE, page * PAGE))
  let q = status === 'MINE' ? QUEUE_MINE(base, mine) : filterOrders(base, status, b)
  if (term) q = q.or(`quote_no.ilike.%${term}%,customer_name.ilike.%${term}%,doc_no.ilike.%${term}%`)

  const [view, { data: orders, error }, c] = await Promise.all([
    viewId ? findOrder(viewId, me) : null,
    q,
    orderCounts(me.role === 'sales' ? me.id : null), // sales users count only their own
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
  const SortTh = ({ label, up, down, cls }) => {
    const on = sort === up || sort === down
    const next = sort === down ? up : down
    return (
      <th className={cls} aria-sort={on ? (SORTS[sort][1] ? 'ascending' : 'descending') : 'none'}>
        <Link prefetch={false} href={sortHref(next)} className="th-sort"><LinkBusy />{label}<i className={`ph ${on ? (SORTS[sort][1] ? 'ph-caret-up' : 'ph-caret-down') : 'ph-caret-up-down'}`} aria-hidden="true" /></Link>
      </th>
    )
  }
  const tabs = [mine && ['MINE', 'ph-user'], ['ACTIVE', 'ph-lightning'], ['', 'ph-list-checks']].filter(Boolean)
  const boss = ['admin', 'manager'].includes(me.role)
  const filter = FILTERS.find((f) => f.status === status)
  const exportParams = new URLSearchParams({ ...(filter ? { status } : {}), ...(term ? { q: term } : {}) })

  return (
    <>
      <div className="card">
        <div className="tbl-top">
          <nav className="tabs" aria-label="Which orders" style={{ marginBottom: 0 }}>
            {tabs.map(([k, icon]) => (
              <Link prefetch={false} key={k} href={href({ ...listOf(k), ...keep })} className={`tab${status === k ? ' on' : ''}`} aria-current={status === k ? 'page' : undefined}>
                <LinkBusy /><i className={`ph ${icon}`} />{TITLES[k]}<span className="badge b-none">{countOf(k)}</span>
              </Link>
            ))}
          </nav>
          <div className="tbl-filters">
            {boss && (
              // key: picking a list closes the menu
              <details className="dl-menu q-menu" key={status}>
                <summary className={`btn btn-sm ${filter ? 'btn-primary' : 'btn-ghost'}`}>
                  <i className="ph ph-funnel" />{filter?.label || 'Filter'}<i className="ph ph-caret-down" />
                </summary>
                <div className="dl-list">
                  {FILTERS.map((f) => (
                    <Link prefetch={false} key={f.status} href={href({ status: f.status, ...keep })} className="dl-item">
                      <i className={`ph ${f.icon}`} />{f.label}<span className="badge b-none" style={{ marginLeft: 'auto' }}>{countOf(f.status)}</span>
                    </Link>
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
          </div>
        </div>
        {error && <div className="banner error" style={{ margin: '0 20px 16px' }} title={error.message}><i className="ph ph-warning-circle" />Couldn't load the orders. Press Refresh to try again; if it keeps failing, tell the admin.</div>}
        <div className="tbl-wrap">
          <table className="tbl orders-tbl">
            <thead>
              <tr>
                <SortTh label="Quote No" up="oldest" down="newest" cls="c-q" />
                <SortTh label="Customer" up="customer" down="customer_desc" cls="c-cust" />
                <th className="c-st">Status</th>
                <th className="r c-tot">Total (SAR)</th>
                <th className="c-docs">Documents</th>
                <th className="c-date">Date</th>
                <th className="c-sp">Salesperson</th>
                <th className="r c-act">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows?.map((o) => {
                const pcs = (o.items || []).reduce((n, it) => n + Number(it.qty || 0), 0)
                const bs = o.batches || []
                const d = actionData(o)
                return (
                  <ClickRow key={o.id} href={viewHref(o.id)}>
                    <td className="nowrap c-q"><Link prefetch={false} href={viewHref(o.id)} scroll={false} className="qno">{o.quote_no}</Link></td>
                    <td className="c-cust"><bdi className="cust-name">{o.customer_name}</bdi></td>
                    <td className="nowrap c-st">
                      {o.status === 'APPROVED' && DISPATCH[o.dispatch_status]
                        ? <span className={`badge ${DISPATCH[o.dispatch_status][1]}`}>{DISPATCH[o.dispatch_status][0]}</span>
                        : <span className={`badge b-${o.status}`}>{STATUS[o.status] || o.status}</span>}
                    </td>
                    <td className="num c-tot"><span className="fw6">{money(totals(o.items, o.transport, o.vat_rate).total)}</span><span className="cell-sub">{int(pcs)} PCS</span></td>
                    <td className="c-docs">
                      <DocsMenu o={d} />
                      <span className="cell-sub doc-ref">{bs.length === 1 ? bs[0].do_no : bs.length ? plural(bs.length, 'DO') : o.doc_no || 'Quote only'}</span>
                    </td>
                    <td className="nowrap muted c-date">{day(o.quote_date)}</td>
                    <td className="c-sp">{o.salesperson_name}</td>
                    <td className="nowrap c-act"><div className="row-acts icons"><OrderActions o={d} me={{ role: me.role }} back={listHref} sm /></div></td>
                  </ClickRow>
                )
              })}
            </tbody>
          </table>
          {!rows?.length && (
            <div className="empty">
              <i className="ph ph-clipboard-text" />
              <h3>No orders found</h3>
              <p>{term ? `Nothing matches “${term}”.` : 'Nothing in this list yet.'}</p>
            </div>
          )}
        </div>
        {(page > 1 || more) && (
          <div className="tbl-foot center">
            {page > 1 && <Link prefetch={false} className="btn btn-ghost btn-sm" href={pageHref(page - 1)}><LinkBusy /><i className="ph ph-caret-left" />{sort === 'newest' ? 'Newer' : 'Previous'}</Link>}
            <span className="spacer muted text-sm c">Page {page}</span>
            {more && <Link prefetch={false} className="btn btn-ghost btn-sm" href={pageHref(page + 1)}><LinkBusy />{sort === 'newest' ? 'Older' : 'Next'}<i className="ph ph-caret-right" /></Link>}
          </div>
        )}
      </div>
      {view && <OrderDialog o={view} history={history} me={me} back={viewHref(view.id)} closeHref={listHref} openBatchPi={sp.open_batch_pi} />}
    </>
  )
}
