import Link from 'next/link'
import { db, orderCounts, requireRole } from '@/lib/server'
import { DISPATCH, STATUS, can, day, money, totals } from '@/lib/tas'
import { invTodo } from '@/lib/todo'
import { CustName, LinkBusy } from './ui'

export const metadata = { title: 'Dashboard' }

// One tile of a pipeline row. Tiles with work waiting get a solid surface; empty ones stay quiet.
function Tile({ href, icon, n, label, sub }) {
  return (
    <Link prefetch={false} href={href} className={`dash-stat${n > 0 ? ' has' : ''}`}>
      <div className="dash-stat-top">
        <i className={`ph ${icon}`} />
        <i className="ph ph-caret-right" />
      </div>
      <div className="dash-stat-num">{n}</div>
      <div className="dash-stat-lbl">{label}</div>
      <div className="dash-stat-sub">{sub}</div>
    </Link>
  )
}

export default async function Dashboard() {
  const me = await requireRole()
  const boss = ['admin', 'manager'].includes(me.role)

  const [c, inv, { data: events }, { data: rawRecent }] = await Promise.all([
    orderCounts(me.role === 'sales' ? me.id : null),
    boss ? invTodo() : { po: 0, grn: 0, qc: 0, toPlan: 0, toPlanPcs: 0 },
    db().from('order_events')
      .select('id, at, by_name, action, detail, order_id, order:orders(quote_no, customer_name)')
      .order('id', { ascending: false }).limit(10),
    db().from('orders')
      .select('id, quote_no, quote_date, customer_name, status, dispatch_status, transport, vat_rate, items:order_items(qty, m2, price, total)')
      .not('status', 'in', '("REJECTED","CANCELLED")')
      .order('id', { ascending: false })
      .limit(6),
  ])

  const recent = (rawRecent || []).map((o) => ({ ...o, total: totals(o.items || [], o.transport, o.vat_rate).total }))
  const toApprove = c.PENDING || 0
  const inProduction = c.AWAIT_DISPATCH || 0
  const readyToShip = c.AWAIT_DO || 0
  const billing = (c.AWAIT_PI || 0) + (c.AWAIT_TAX || 0)

  return (
    <div className="dash">
      <div className="dash-head">
        <div>
          <h2 className="dash-hi">Good day, {me.full_name}</h2>
          <div className="dash-role">{me.role}</div>
        </div>
        <div className="dash-acts">
          {can(me, 'sales') && (
            <Link prefetch={false} href="/orders/new" className="btn btn-primary btn-sm"><LinkBusy /><i className="ph ph-plus" />New quotation</Link>
          )}
          {can(me, 'plant') && (
            <Link prefetch={false} href="/production/dpr/new" className="btn btn-ghost btn-sm"><LinkBusy /><i className="ph ph-gear-six" />Enter shift output</Link>
          )}
          {can(me, 'plant') && (
            <Link prefetch={false} href="/inventory/issue/new" className="btn btn-ghost btn-sm"><LinkBusy /><i className="ph ph-arrows-left-right" />Issue to line</Link>
          )}
          {can(me, 'buying') && (
            <Link prefetch={false} href="/inventory/po/new" className="btn btn-ghost btn-sm"><LinkBusy /><i className="ph ph-shopping-cart" />New PO</Link>
          )}
        </div>
      </div>

      <div className="dash-grid">
        <div className="dash-main">
          <section className="dash-sec" aria-labelledby="h-pipe">
            <div className="dash-sec-head">
              <h2 id="h-pipe">Order pipeline</h2>
              <Link prefetch={false} href="/orders">All active orders ({c.ACTIVE || 0}) →</Link>
            </div>
            <div className="dash-stat-grid">
              <Tile href="/orders?status=PENDING" icon="ph-hourglass" n={toApprove} label="1. To approve" sub={toApprove === 1 ? '1 quote' : `${toApprove} quotes`} />
              <Tile href="/orders?status=AWAIT_DISPATCH" icon="ph-package" n={inProduction} label="2. In production" sub={inProduction === 1 ? '1 order' : `${inProduction} orders`} />
              <Tile href="/orders?status=AWAIT_DO" icon="ph-truck" n={readyToShip} label="3. Ready to ship" sub={readyToShip === 1 ? '1 order' : `${readyToShip} orders`} />
              <Tile href="/orders?status=AWAIT_PI" icon="ph-receipt" n={billing} label="4. Billing" sub={`${c.AWAIT_PI || 0} PI · ${c.AWAIT_TAX || 0} tax invoice`} />
            </div>
          </section>

          {boss && (
            <section className="dash-sec" aria-labelledby="h-fac">
              <div className="dash-sec-head">
                <h2 id="h-fac">Factory and stock</h2>
                <Link prefetch={false} href="/inventory">Inventory →</Link>
              </div>
              <div className="dash-stat-grid">
                <Tile href="/inventory/po" icon="ph-shopping-cart" n={inv.po} label="Purchasing" sub={`${inv.po} waiting`} />
                <Tile href="/inventory/grn" icon="ph-truck" n={inv.grn} label="Receive and check" sub={inv.grn === 1 ? '1 delivery' : `${inv.grn} deliveries`} />
                <Tile href="/production" icon="ph-calendar-check" n={inv.toPlan} label="Shortages" sub={inv.toPlanPcs > 0 ? `${inv.toPlanPcs} PCS needed` : 'None'} />
                <Tile href="/production/qc" icon="ph-seal-check" n={inv.qc} label="Check pieces" sub={inv.qc === 1 ? '1 row waiting' : `${inv.qc} rows waiting`} />
              </div>
            </section>
          )}

          <section className="card" aria-labelledby="h-recent">
            <div className="dash-card-head">
              <h2 id="h-recent">Recent orders</h2>
              <Link prefetch={false} href="/orders?show=all">All orders →</Link>
            </div>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr><th>Quote no</th><th>Customer</th><th>Status</th><th className="r">Total (SAR)</th></tr>
                </thead>
                <tbody>
                  {recent.map((o) => (
                    <tr key={o.id}>
                      <td className="nowrap"><Link prefetch={false} href={`/orders?view=${o.id}`} className="qno">{o.quote_no}</Link></td>
                      <td className="fw6"><CustName name={o.customer_name} /></td>
                      <td className="nowrap">
                        <span className={`badge b-${o.status}`}>{STATUS[o.status] || o.status}</span>{' '}
                        {o.status === 'APPROVED' && DISPATCH[o.dispatch_status] && (
                          <span className={`badge ${DISPATCH[o.dispatch_status][1]}`}>{DISPATCH[o.dispatch_status][0]}</span>
                        )}
                      </td>
                      <td className="num fw6 nowrap">{money(o.total)}</td>
                    </tr>
                  ))}
                  {!recent.length && <tr><td colSpan={4} className="c muted">No orders yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <div className="dash-side">
          <section className="card" aria-labelledby="h-act">
            <div className="dash-card-head">
              <h2 id="h-act">Latest activity</h2>
              {boss && <Link prefetch={false} href="/admin/activity">Full log →</Link>}
            </div>
            <div className="dash-activity-list">
              {events?.map((ev, i) => {
                // Consecutive events on the same order share one header.
                const same = i > 0 && events[i - 1].order_id === ev.order_id
                return (
                  <div key={ev.id} className="dash-activity-item">
                    {!same && (
                      <div className="dash-act-head">
                        {ev.order?.quote_no
                          ? <Link prefetch={false} href={`/orders?view=${ev.order_id}`} className="qno fw7">{ev.order.quote_no}</Link>
                          : <span className="muted text-xs">—</span>}
                        <span className="muted text-xs">{day(ev.at)}</span>
                      </div>
                    )}
                    <div className="dash-act-acts">
                      <span className="badge b-none">{ev.action}</span>
                      <span className="text-xs muted">{ev.by_name || 'System'}</span>
                    </div>
                    {ev.detail && <p className="dash-act-detail" title={ev.detail}>{ev.detail}</p>}
                  </div>
                )
              })}
              {!events?.length && <div className="c muted dash-activity-item">No activity yet.</div>}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
