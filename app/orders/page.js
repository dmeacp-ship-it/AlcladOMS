import Link from 'next/link'
import { batchQueues, db, filterOrders, findOrder, orderCounts, orderHistory, requireRole } from '@/lib/server'
import { DISPATCH, STATUS, day, int, money, plural, totals } from '@/lib/tas'
import { ClickRow, DocsMenu } from '../ui'
import OrderDialog from './OrderDialog'
import OrderActions from './OrderActions'

const TILES = [
  { status: '', label: 'All Orders', icon: 'ph-list-checks', cls: 'ca' },
  { status: 'ACTIVE', label: 'Active Orders', icon: 'ph-lightning', cls: 'ca' },
  { status: 'PENDING', label: 'Pending', icon: 'ph-hourglass', cls: 'co' },
  { status: 'AWAIT_DO', label: 'Awaiting DO', icon: 'ph-truck', cls: 'co' },
  { status: 'AWAIT_DISPATCH', label: 'Awaiting Dispatch', icon: 'ph-package', cls: 'co' },
  { status: 'AWAIT_PI', label: 'Awaiting PI', icon: 'ph-receipt', cls: 'co' },
  { status: 'AWAIT_TAX', label: 'Awaiting Tax Inv', icon: 'ph-upload-simple', cls: 'co' },
  { status: 'APPROVED', label: 'Approved', icon: 'ph-seal-check', cls: 'cg' },
  { status: 'REJECTED', label: 'Rejected', icon: 'ph-x-circle', cls: 'cr' },
]
const PAGE = 100
// ?sort= values: column -> [order column, ascending]
const SORTS = { newest: ['id', false], oldest: ['id', true], customer: ['customer_name', true], customer_desc: ['customer_name', false] }

// Tab title: the open order's quote no, else the list ("Awaiting PI · TAS OMS").
export async function generateMetadata({ searchParams }) {
  const sp = await searchParams
  const o = sp.view ? await findOrder(sp.view, await requireRole()) : null
  return { title: o?.quote_no || TILES.find((t) => t.status === (sp.status || ''))?.label || 'Orders' }
}

export default async function Orders({ searchParams }) {
  const me = await requireRole()
  const sp = await searchParams
  const status = sp.status || ''
  const term = String(sp.q || '').replace(/[,()*%]/g, '').trim()
  const page = Math.max(1, parseInt(sp.page) || 1)
  const sort = SORTS[sp.sort] ? sp.sort : 'newest'
  const own = (q) => (me.role === 'sales' ? q.eq('salesperson_id', me.id) : q)

  const b = await batchQueues()
  let q = filterOrders(own(db().from('orders')
    .select('id, quote_no, quote_date, customer_name, salesperson_name, status, dispatch_status, doc_no, do_date, pi_date, tax_invoice_path, transport, vat_rate, items:order_items(id, item_no, description, qty, price, total, delivered_qty, ready_qty, dispatched_qty, balance_qty, production_status), batches:order_batches(id, batch_no, do_no, do_date, pi_no, pi_date, tax_invoice_path, items:batch_items(id, do_qty, order_item:order_items(description, price)))')
    .order(SORTS[sort][0], { ascending: SORTS[sort][1] }).order('id', { ascending: false }).range((page - 1) * PAGE, page * PAGE)), status, b)
  if (term) q = q.or(`quote_no.ilike.%${term}%,customer_name.ilike.%${term}%,doc_no.ilike.%${term}%`)

  const [view, history, { data: orders, error }, c] = await Promise.all([
    sp.view ? findOrder(sp.view, me) : null,
    /^\d+$/.test(sp.view || '') ? orderHistory(sp.view) : null, // shown only if findOrder allowed the order
    q,
    orderCounts(me.role === 'sales' ? me.id : null), // sales users count only their own
  ])
  const countOf = (s) => c[s || 'ALL'] ?? 0
  // One extra row was fetched to know whether a next page exists.
  const more = orders?.length > PAGE
  const rows = orders?.slice(0, PAGE)
  rows?.forEach((o) => o.items.sort((a, b) => a.item_no - b.item_no))
  const list = { ...(status && { status }), ...(term && { q: term }), ...(sort !== 'newest' && { sort }), ...(page > 1 && { page }) }
  const pageHref = (n) => `/orders?${new URLSearchParams({ ...list, page: n })}`
  const viewHref = (id) => `/orders?${new URLSearchParams({ ...list, view: id })}`
  const listHref = `/orders${Object.keys(list).length ? `?${new URLSearchParams(list)}` : ''}`
  // Column header that sorts the list (first page), with aria-sort for screen readers.
  const sortHref = (k) => `/orders?${new URLSearchParams({ ...(status && { status }), ...(term && { q: term }), ...(k !== 'newest' && { sort: k }) })}`
  const SortTh = ({ label, up, down, cls }) => {
    const on = sort === up || sort === down
    const next = sort === down ? up : down
    return (
      <th className={cls} aria-sort={on ? (SORTS[sort][1] ? 'ascending' : 'descending') : 'none'}>
        <Link prefetch={false} href={sortHref(next)} className="th-sort">{label}<i className={`ph ${on ? (SORTS[sort][1] ? 'ph-caret-up' : 'ph-caret-down') : 'ph-caret-up-down'}`} aria-hidden="true" /></Link>
      </th>
    )
  }

  return (
    <>
      {status !== 'ACTIVE' && <div className="stats">
        {TILES.map((t) => (
          <Link prefetch={false} key={t.label} href={t.status ? `/orders?status=${t.status}` : '/orders'} className={`stat${status === t.status ? ' on' : ''}`}>
            <i className={`ph ${t.icon} stat-ic ${t.cls}`} />
            <div className={`stat-n ${t.cls}`}>{countOf(t.status)}</div>
            <div className="stat-l">{t.label}</div>
          </Link>
        ))}
      </div>}

      <div className="card">
        <div className="tbl-top">
          <h2 className="tbl-ttl">
            <i className="ph ph-list-checks" />
            {status === 'PENDING' ? 'Pending Approval' : TILES.find((t) => t.status === status)?.label ?? 'All Orders'}
            <span className="badge b-none">{countOf(status)}</span>
          </h2>
          <form className="tbl-filters">
            {status && <input type="hidden" name="status" value={status} />}
            <div className="sw">
              <i className="ph ph-magnifying-glass" />
              <input className="tsearch" name="q" defaultValue={term} placeholder="Quote no, customer, DO/PI no" aria-label="Search this list" />
            </div>
            {['admin', 'manager'].includes(me.role) && (
              <a className="btn btn-ghost btn-sm" href={`/admin/export/orders?${new URLSearchParams({ ...(status && { status }), ...(term && { q: term }) })}`}>
                <i className="ph ph-download-simple" />Export
              </a>
            )}
          </form>
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
                return (
                  <ClickRow key={o.id} href={viewHref(o.id)}>
                    <td className="nowrap c-q"><Link prefetch={false} href={viewHref(o.id)} scroll={false} className="qno">{o.quote_no}</Link></td>
                    <td className="c-cust"><bdi className="cust-name">{o.customer_name}</bdi></td>
                    <td className="nowrap c-st">
                      {/* One badge: dispatch progress once approved, else the approval status */}
                      {o.status === 'APPROVED' && DISPATCH[o.dispatch_status]
                        ? <span className={`badge ${DISPATCH[o.dispatch_status][1]}`}>{DISPATCH[o.dispatch_status][0]}</span>
                        : <span className={`badge b-${o.status}`}>{STATUS[o.status] || o.status}</span>}
                    </td>
                    <td className="num c-tot"><span className="fw6">{money(totals(o.items, o.transport, o.vat_rate).total)}</span><span className="cell-sub">{int(pcs)} PCS</span></td>
                    <td className="c-docs">
                      <DocsMenu o={o} />
                      <span className="cell-sub doc-ref">{bs.length === 1 ? bs[0].do_no : bs.length ? plural(bs.length, 'DO') : o.doc_no || 'Quote only'}</span>
                    </td>
                    <td className="nowrap muted c-date">{day(o.quote_date)}</td>
                    <td className="c-sp">{o.salesperson_name}</td>
                    <td className="nowrap c-act"><div className="row-acts icons"><OrderActions o={o} me={me} back={listHref} sm /></div></td>
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
            {page > 1 && <Link prefetch={false} className="btn btn-ghost btn-sm" href={pageHref(page - 1)}><i className="ph ph-caret-left" />{sort === 'newest' ? 'Newer' : 'Previous'}</Link>}
            <span className="spacer muted text-sm c">Page {page}</span>
            {more && <Link prefetch={false} className="btn btn-ghost btn-sm" href={pageHref(page + 1)}>{sort === 'newest' ? 'Older' : 'Next'}<i className="ph ph-caret-right" /></Link>}
          </div>
        )}
      </div>
      {view && <OrderDialog o={view} history={history} me={me} back={viewHref(view.id)} closeHref={listHref} openBatchPi={sp.open_batch_pi} />}
    </>
  )
}
