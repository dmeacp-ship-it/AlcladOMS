import Link from 'next/link'
import { db, filterOrders, findOrder, orderCounts, orderHistory, requireRole } from '@/lib/server'
import { DISPATCH, dmy, money, totals } from '@/lib/tas'
import { ClickRow, DocView, DocsMenu } from '../ui'
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
  const own = (q) => (me.role === 'sales' ? q.eq('salesperson_id', me.id) : q)

  let q = filterOrders(own(db().from('orders')
    .select('id, quote_no, quote_date, customer_name, salesperson_name, status, dispatch_status, doc_no, do_date, pi_date, tax_invoice_path, transport, vat_rate, items:order_items(id, item_no, description, qty, price, total, delivered_qty, ready_qty, dispatched_qty, balance_qty, production_status), batches:order_batches(id, batch_no, do_no, do_date, pi_no, pi_date, tax_invoice_path, items:batch_items(id, do_qty, order_item:order_items(description, price)))')
    .order('id', { ascending: false }).range((page - 1) * PAGE, page * PAGE)), status)
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
  const list = { ...(status && { status }), ...(term && { q: term }), ...(page > 1 && { page }) }
  const pageHref = (n) => `/orders?${new URLSearchParams({ ...list, page: n })}`
  const viewHref = (id) => `/orders?${new URLSearchParams({ ...list, view: id })}`
  const listHref = `/orders${Object.keys(list).length ? `?${new URLSearchParams(list)}` : ''}`

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
                <th>Quote No</th>
                <th>Date</th>
                <th>Customer</th>
                <th>Salesperson</th>
                <th className="r">Total Qty</th>
                <th className="r">Total (SAR)</th>
                <th>Status</th>
                <th>DO No</th>
                <th>PI No</th>
                <th>Documents</th>
                <th className="r">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows?.map((o) => (
                <ClickRow key={o.id} href={viewHref(o.id)}>
                  <td className="nowrap"><Link prefetch={false} href={viewHref(o.id)} scroll={false} className="qno">{o.quote_no}</Link></td>
                  <td className="nowrap muted">{dmy(o.quote_date)}</td>
                  <td className="nowrap fw6"><bdi>{o.customer_name}</bdi></td>
                  <td className="nowrap">{o.salesperson_name}</td>
                  <td className="num">{(o.items || []).reduce((n, it) => n + Number(it.qty || 0), 0)} PCS</td>
                  <td className="num fw6">{money(totals(o.items, o.transport, o.vat_rate).total)}</td>
                  <td className="nowrap">
                    <div className="docs nowrap">
                      {/* One badge: dispatch progress once approved, else the approval status */}
                      {o.status === 'APPROVED' && DISPATCH[o.dispatch_status]
                        ? <span className={`badge ${DISPATCH[o.dispatch_status][1]}`}>{DISPATCH[o.dispatch_status][0]}</span>
                        : <span className={`badge b-${o.status}`}>{o.status}</span>}
                    </div>
                  </td>
                  <td className="nowrap">
                    {o.batches?.length
                      ? o.batches.map((b) => <div key={b.id}><DocView href={`/orders/${o.id}/print/do?batch=${b.id}`} icon="ph-truck" label={b.do_no || `Batch #${b.batch_no}`} cls="doc-no" /></div>)
                      : o.do_date ? <DocView href={`/orders/${o.id}/print/do`} icon="ph-truck" label={o.doc_no || 'DO'} cls="doc-no" /> : <span className="muted">—</span>}
                  </td>
                  <td className="nowrap">
                    {o.batches?.some((b) => b.pi_no)
                      ? o.batches.filter((b) => b.pi_no).map((b) => <div key={b.id}><DocView href={`/orders/${o.id}/print/pi?batch=${b.id}`} icon="ph-receipt" label={b.pi_no} cls="doc-no" /></div>)
                      : <span className="muted">—</span>}
                  </td>
                  <td className="nowrap"><DocsMenu o={o} /></td>
                  <td className="nowrap"><div className="row-acts icons"><OrderActions o={o} me={me} back={listHref} sm /></div></td>
                </ClickRow>
              ))}
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
            {page > 1 && <Link prefetch={false} className="btn btn-ghost btn-sm" href={pageHref(page - 1)}><i className="ph ph-caret-left" />Newer</Link>}
            <span className="spacer muted text-sm c">Page {page}</span>
            {more && <Link prefetch={false} className="btn btn-ghost btn-sm" href={pageHref(page + 1)}>Older<i className="ph ph-caret-right" /></Link>}
          </div>
        )}
      </div>
      {view && <OrderDialog o={view} history={history} me={me} back={viewHref(view.id)} closeHref={listHref} openBatchPi={sp.open_batch_pi} />}
    </>
  )
}
