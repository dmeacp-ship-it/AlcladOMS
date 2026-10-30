import Link from 'next/link'
import { db, orderCounts, requireRole } from '@/lib/server'
import { STATUS, can, day, money } from '@/lib/tas'
import { invTodo } from '@/lib/todo'
import { LinkBusy } from './ui'

export const metadata = { title: 'Dashboard' }

export default async function Dashboard() {
  const me = await requireRole()
  const boss = ['admin', 'manager'].includes(me.role)

  const [c, inv, { data: events }, { data: activeOrders }] = await Promise.all([
    orderCounts(me.role === 'sales' ? me.id : null),
    boss ? invTodo() : { po: 0, grn: 0, qc: 0, toPlan: 0, toPlanPcs: 0 },
    db().from('order_events')
      .select('id, at, by_name, action, detail, order_id, order:orders(quote_no, customer_name)')
      .order('id', { ascending: false }).limit(12),
    db().from('orders')
      .select('id, quote_no, quote_date, customer_name, status, dispatch_status, total')
      .not('status', 'in', '("REJECTED","CANCELLED")')
      .order('id', { ascending: false })
      .limit(6),
  ])

  const pendingApprovals = c.PENDING || 0
  const inProduction = c.AWAIT_DISPATCH || 0
  const readyToShip = c.AWAIT_DO || 0
  const billingPending = (c.AWAIT_PI || 0) + (c.AWAIT_TAX || 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 24 }}>
      {/* Top Banner Card: Greeting on Left, Quick Shortcuts on Right (Option B) */}
      <div className="card dash-banner">
        <div className="dash-banner-info">
          <h2 className="dash-banner-title">
            Good day, {me.full_name}
          </h2>
          <span className="dash-banner-sub">
            Role: <b style={{ textTransform: 'capitalize' }}>{me.role}</b> · Operational Command Center
          </span>
        </div>
        <div className="dash-banner-acts">
          {can(me, 'sales') && (
            <Link prefetch={false} href="/orders/new" className="btn btn-primary btn-sm">
              <LinkBusy /><i className="ph ph-plus" />New Quotation
            </Link>
          )}
          {can(me, 'plant') && (
            <Link prefetch={false} href="/inventory/issue/new" className="btn btn-ghost btn-sm">
              <LinkBusy /><i className="ph ph-arrows-left-right" />Issue RM to Line
            </Link>
          )}
          {can(me, 'plant') && (
            <Link prefetch={false} href="/production/dpr/new" className="btn btn-ghost btn-sm">
              <LinkBusy /><i className="ph ph-gear-six" />Record Shift Output (DPR)
            </Link>
          )}
          {can(me, 'buying') && (
            <Link prefetch={false} href="/inventory/po/new" className="btn btn-ghost btn-sm">
              <LinkBusy /><i className="ph ph-shopping-cart" />Create Purchase Order
            </Link>
          )}
        </div>
      </div>

      {/* 2-Column Command Center Grid */}
      <div className="dash-grid">
        {/* Left Column: Operations & Active Pipelines */}
        <div className="dash-main">
          {/* Order Lifecycle Pipeline */}
          <div className="card" style={{ padding: '16px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.9375rem', fontWeight: 700 }}>
                <i className="ph ph-lightning" style={{ color: 'var(--accentH)', fontSize: '1.125rem' }} />
                <span>Orders Pipeline</span>
              </div>
              <Link prefetch={false} href="/orders" className="text-xs fw6" style={{ color: 'var(--accentH)' }}>
                All Active Orders ({c.ACTIVE || 0}) →
              </Link>
            </div>

            <div className="dash-stat-grid">
              {/* Step 1: Approvals */}
              <Link prefetch={false} href="/orders?status=PENDING" className="dash-stat">
                <div className="dash-stat-top">
                  <i className="ph ph-hourglass" />
                  <i className="ph ph-caret-right" style={{ fontSize: '0.75rem', color: 'var(--muted)' }} />
                </div>
                <div className="dash-stat-num" style={{ color: pendingApprovals > 0 ? 'var(--yellow)' : 'inherit' }}>
                  {pendingApprovals}
                </div>
                <div className="dash-stat-lbl">1. To Approve</div>
                <div className="dash-stat-sub">
                  {pendingApprovals === 1 ? '1 quote waiting' : `${pendingApprovals} quotes`}
                </div>
              </Link>

              {/* Step 2: Production */}
              <Link prefetch={false} href="/orders?status=AWAIT_DISPATCH" className="dash-stat">
                <div className="dash-stat-top">
                  <i className="ph ph-package" />
                  <i className="ph ph-caret-right" style={{ fontSize: '0.75rem', color: 'var(--muted)' }} />
                </div>
                <div className="dash-stat-num" style={{ color: inProduction > 0 ? 'var(--teal)' : 'inherit' }}>
                  {inProduction}
                </div>
                <div className="dash-stat-lbl">2. In Production</div>
                <div className="dash-stat-sub">
                  {inProduction === 1 ? '1 on floor' : `${inProduction} orders`}
                </div>
              </Link>

              {/* Step 3: Ready to Ship */}
              <Link prefetch={false} href="/orders?status=AWAIT_DO" className="dash-stat">
                <div className="dash-stat-top">
                  <i className="ph ph-truck" />
                  <i className="ph ph-caret-right" style={{ fontSize: '0.75rem', color: 'var(--muted)' }} />
                </div>
                <div className="dash-stat-num" style={{ color: readyToShip > 0 ? 'var(--green)' : 'inherit' }}>
                  {readyToShip}
                </div>
                <div className="dash-stat-lbl">3. Ready to Ship</div>
                <div className="dash-stat-sub">
                  {readyToShip === 1 ? '1 ready for DO' : `${readyToShip} orders`}
                </div>
              </Link>

              {/* Step 4: Billing */}
              <Link prefetch={false} href="/orders?status=AWAIT_PI" className="dash-stat">
                <div className="dash-stat-top">
                  <i className="ph ph-receipt" />
                  <i className="ph ph-caret-right" style={{ fontSize: '0.75rem', color: 'var(--muted)' }} />
                </div>
                <div className="dash-stat-num" style={{ color: billingPending > 0 ? 'var(--orange)' : 'inherit' }}>
                  {billingPending}
                </div>
                <div className="dash-stat-lbl">4. To Invoice</div>
                <div className="dash-stat-sub">
                  {c.AWAIT_PI || 0} PI · {c.AWAIT_TAX || 0} Tax
                </div>
              </Link>
            </div>
          </div>

          {/* Factory & Stock Operations (Boss only) */}
          {boss && (
            <div className="card" style={{ padding: '16px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.9375rem', fontWeight: 700 }}>
                  <i className="ph ph-factory" style={{ color: 'var(--accentH)', fontSize: '1.125rem' }} />
                  <span>Factory & Inventory</span>
                </div>
                <Link prefetch={false} href="/inventory" className="text-xs fw6" style={{ color: 'var(--accentH)' }}>
                  Inventory Overview →
                </Link>
              </div>

              <div className="dash-stat-grid">
                <Link prefetch={false} href="/inventory/po" className="dash-stat">
                  <div className="dash-stat-top">
                    <i className="ph ph-shopping-cart" />
                    <i className="ph ph-caret-right" style={{ fontSize: '0.75rem', color: 'var(--muted)' }} />
                  </div>
                  <div className="dash-stat-num" style={{ color: inv.po > 0 ? 'var(--yellow)' : 'inherit' }}>
                    {inv.po}
                  </div>
                  <div className="dash-stat-lbl">Purchasing</div>
                  <div className="dash-stat-sub">
                    {inv.po === 1 ? '1 waiting approval' : `${inv.po} waiting`}
                  </div>
                </Link>

                <Link prefetch={false} href="/inventory/grn" className="dash-stat">
                  <div className="dash-stat-top">
                    <i className="ph ph-truck" />
                    <i className="ph ph-caret-right" style={{ fontSize: '0.75rem', color: 'var(--muted)' }} />
                  </div>
                  <div className="dash-stat-num" style={{ color: inv.grn > 0 ? 'var(--orange)' : 'inherit' }}>
                    {inv.grn}
                  </div>
                  <div className="dash-stat-lbl">Receive & Check</div>
                  <div className="dash-stat-sub">
                    {inv.grn === 1 ? '1 incoming delivery' : `${inv.grn} deliveries`}
                  </div>
                </Link>

                <Link prefetch={false} href="/production" className="dash-stat">
                  <div className="dash-stat-top">
                    <i className="ph ph-calendar-check" />
                    <i className="ph ph-caret-right" style={{ fontSize: '0.75rem', color: 'var(--muted)' }} />
                  </div>
                  <div className="dash-stat-num" style={{ color: inv.toPlan > 0 ? 'var(--red)' : 'inherit' }}>
                    {inv.toPlan}
                  </div>
                  <div className="dash-stat-lbl">Shortages</div>
                  <div className="dash-stat-sub">
                    {inv.toPlanPcs > 0 ? `${inv.toPlanPcs} PCS needed` : 'No shortages'}
                  </div>
                </Link>

                <Link prefetch={false} href="/production/qc" className="dash-stat">
                  <div className="dash-stat-top">
                    <i className="ph ph-seal-check" />
                    <i className="ph ph-caret-right" style={{ fontSize: '0.75rem', color: 'var(--muted)' }} />
                  </div>
                  <div className="dash-stat-num" style={{ color: inv.qc > 0 ? 'var(--teal)' : 'inherit' }}>
                    {inv.qc}
                  </div>
                  <div className="dash-stat-lbl">Shift QC Check</div>
                  <div className="dash-stat-sub">
                    {inv.qc === 1 ? '1 row awaiting' : `${inv.qc} rows awaiting`}
                  </div>
                </Link>
              </div>
            </div>
          )}

          {/* Active Orders Table Card */}
          <div className="card">
            <div className="tbl-top" style={{ padding: '12px 18px', minHeight: 48 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.9375rem', fontWeight: 700 }}>
                <i className="ph ph-list-checks" style={{ color: 'var(--accentH)', fontSize: '1.125rem' }} />
                <span>Active Orders</span>
              </div>
              <Link prefetch={false} href="/orders" className="text-xs fw6" style={{ color: 'var(--accentH)' }}>
                View All ({c.ACTIVE || 0}) →
              </Link>
            </div>

            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Quote No</th>
                    <th>Customer</th>
                    <th>Status</th>
                    <th className="r">Total (SAR)</th>
                    <th className="r">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {activeOrders?.map((o) => (
                    <tr key={o.id}>
                      <td className="nowrap">
                        <Link prefetch={false} href={`/orders?view=${o.id}`} className="qno fw7">
                          {o.quote_no}
                        </Link>
                      </td>
                      <td>
                        <span className="fw6" style={{ fontSize: '0.8125rem' }}>{o.customer_name}</span>
                      </td>
                      <td className="nowrap">
                        <span className={`badge b-${o.status}`}>{STATUS[o.status] || o.status}</span>
                        {o.dispatch_status && <span className="badge b-info" style={{ marginLeft: 4 }}>{o.dispatch_status}</span>}
                      </td>
                      <td className="num fw6 nowrap">
                        {money(o.total)}
                      </td>
                      <td className="r nowrap">
                        <Link prefetch={false} href={`/orders?view=${o.id}`} className="btn btn-ghost btn-sm" style={{ padding: '4px 10px', fontSize: '0.75rem' }}>
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {!activeOrders?.length && (
                    <tr>
                      <td colSpan={5} className="c muted" style={{ padding: 24 }}>
                        No active orders right now.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Column: Live Activity Audit Stream (Full Height) */}
        <div className="dash-side">
          <div className="card" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div className="tbl-top" style={{ padding: '12px 18px', minHeight: 48, flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.875rem', fontWeight: 700 }}>
                <i className="ph ph-clock-counter-clockwise" style={{ color: 'var(--accentH)', fontSize: '1.125rem' }} />
                <span>Live Activity</span>
              </div>
              {boss && (
                <Link prefetch={false} href="/admin/activity" className="text-xs fw6" style={{ color: 'var(--accentH)' }}>
                  Full Log →
                </Link>
              )}
            </div>

            <div className="dash-activity-list" style={{ maxHeight: '620px', flex: 1 }}>
              {events?.map((ev) => (
                <div key={ev.id} className="dash-activity-item">
                  <div className="dash-act-head">
                    {ev.order?.quote_no ? (
                      <Link prefetch={false} href={`/orders?view=${ev.order_id}`} className="qno fw7" style={{ fontSize: '0.8125rem' }}>
                        {ev.order.quote_no}
                      </Link>
                    ) : (
                      <span className="muted text-xs">—</span>
                    )}
                    <span className="muted text-xs">{day(ev.at)}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '3px 0' }}>
                    <span className="badge b-none" style={{ fontSize: '0.7188rem', padding: '2px 8px' }}>{ev.action}</span>
                    <span className="text-xs muted">by {ev.by_name || 'System'}</span>
                  </div>
                  {ev.detail && (
                    <p className="dash-act-detail" title={ev.detail}>
                      {ev.detail}
                    </p>
                  )}
                </div>
              ))}
              {!events?.length && (
                <div className="c muted" style={{ padding: 32, fontSize: '0.8125rem' }}>
                  No recent activity recorded yet.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
