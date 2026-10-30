import Link from 'next/link'
import { CustName, LinkBusy } from '../../ui'
import { requireRole } from '@/lib/server'
import { dispatch, pct, period, sales, waiting } from '@/lib/reports'
import { int, money } from '@/lib/tas'
import ReportsHead from './ReportsHead'
import { Chart, weekOf, weeks } from './Charts'

export const metadata = { title: { absolute: 'Reports · TAS OMS' } }

// One headline number for the period; the whole tile links to its detailed report.
function Kpi({ href, icon, value, label, sub, bad }) {
  return (
    <Link prefetch={false} href={href} className="dash-stat has">
      <div className="dash-stat-top"><i className={`ph ${icon}`} /><i className="ph ph-caret-right" /></div>
      <div className="dash-stat-num">{value}</div>
      <div className="dash-stat-lbl">{label}</div>
      <div className={`dash-stat-sub${bad ? ' bad' : ''}`}>{sub}</div>
    </Link>
  )
}

function Card({ title, href, link, children }) {
  return (
    <section className="card rpt-card">
      <div className="rpt-head">
        <h2>{title}</h2>
        <Link prefetch={false} href={href}><LinkBusy />{link} →</Link>
      </div>
      {children}
    </section>
  )
}

// Headline numbers for the period, weekly charts, and four summary cards.
export default async function Reports({ searchParams }) {
  await requireRole('manager') // admin + manager
  const p = period(await searchParams)
  const [s, w, d] = await Promise.all([sales(p), waiting(), dispatch(p)])
  const waitingNow = w.reduce((n, q) => n + q.rows.length, 0)
  const overdue = w.reduce((n, q) => n + q.old, 0)

  const wk = weeks(p.from, p.to)
  const sum = (rows, keyOf, valOf) =>
    wk.map((w) => ({ label: w.label, value: rows.filter((r) => keyOf(r) === w.key).reduce((t, r) => t + valOf(r), 0) }))
  const valueWeeks = sum(s.orders.filter((o) => o.status === 'APPROVED'), (o) => weekOf(o.quote_date), s.totalOf)
  const pcsWeeks = sum(d.rows, (r) => weekOf(r.do_date), (r) => r.pcs)

  return (
    <div className="rpt">
      <ReportsHead tab="" p={p} exports={[['orders', 'Orders'], ['lines', 'Order lines'], ['dispatches', 'Dispatches'], ['invoices', 'Invoices']]} />

      <div className="rpt-kpis">
        <Kpi href={`/admin/reports/customers?${p.qs}`} icon="ph-currency-circle-dollar" value={`SAR ${money(s.value)}`} label="Approved value"
          sub={`${s.approved} orders · ${pct(s.approved, s.decided)} win rate`} />
        <Kpi href={`/admin/reports/salespeople?${p.qs}`} icon="ph-file-text" value={int(s.orders.length)} label="Quotations"
          sub={`${s.approved} approved · ${s.orders.length - s.decided} in review`} />
        <Kpi href={`/admin/reports/dispatch?${p.qs}`} icon="ph-truck" value={`${int(d.pcs)} PCS`} label="Dispatched"
          sub={`${d.rows.length} DOs · ${money(d.m2)} m²`} />
        <Kpi href="/admin/reports/waiting" icon="ph-clock" value={int(waitingNow)} label="Waiting now" bad={overdue > 0}
          sub={overdue > 0 ? `${overdue} waiting over 7 days` : 'None over 7 days'} />
      </div>

      <div className="charts">
        <Chart title="Approved value per week (SAR)" kind="line" unit="SAR" points={valueWeeks}
          summary={`Approved value per week from ${p.from} to ${p.to}: ${valueWeeks.map((w) => `${w.label} SAR ${money(w.value)}`).join(', ')}`} />
        <Chart title="Pieces on Delivery Orders per week" kind="bar" unit="PCS" points={pcsWeeks}
          summary={`Pieces on Delivery Orders per week: ${pcsWeeks.map((w) => `${w.label} ${w.value}`).join(', ')}`} />
      </div>

      <div className="rpt-grid">
        <Card title="Salespeople" href={`/admin/reports/salespeople?${p.qs}`} link="Salespeople report">
          <ol className="rpt-list">
            {s.bySales.slice(0, 3).map((rep) => (
              <li key={rep.name}>
                <span className="rpt-name">{rep.name} <span className="muted">· {rep.approved} approved</span></span>
                <b className="num">SAR {money(rep.value)}</b>
              </li>
            ))}
          </ol>
          {!s.bySales.length && <p className="muted text-sm">No quotes in this period.</p>}
        </Card>

        <Card title="Top customers" href={`/admin/reports/customers?${p.qs}`} link="Customers report">
          <ol className="rpt-list">
            {s.byCustomer.slice(0, 3).map((cust) => (
              <li key={cust.name}>
                <span className="rpt-name"><CustName name={cust.name} /></span>
                <span className="rpt-val"><b className="num">SAR {money(cust.value)}</b><span className="muted text-xs">{cust.approved} {cust.approved === 1 ? 'order' : 'orders'}</span></span>
              </li>
            ))}
          </ol>
          {!s.byCustomer.length && <p className="muted text-sm">No approved orders in this period.</p>}
        </Card>

        <Card title="Waiting now" href="/admin/reports/waiting" link="Waiting report">
          <p className={`text-sm${overdue > 0 ? ' red fw6' : ' sub'}`}>
            {overdue > 0 ? `${overdue} ${overdue === 1 ? 'order has' : 'orders have'} waited more than 7 days` : `${waitingNow} waiting, none for more than 7 days`}
          </p>
          <div className="rpt-cells">
            {w.map((q) => (
              <div key={q.key} className="rpt-cell">
                <span><i className={`ph ${q.icon}`} />{q.label}</span>
                <b className={q.old > 0 ? 'red' : ''}>{q.rows.length}</b>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Dispatch" href={`/admin/reports/dispatch?${p.qs}`} link="Dispatch report">
          <p className="text-sm sub">{d.rows.length} DOs · {int(d.pcs)} PCS · {money(d.m2)} m² in this period</p>
          <div className="rpt-cells three">
            <div className="rpt-cell col"><b>{d.toDo ?? 0} d</b><span>Approval → DO</span></div>
            <div className="rpt-cell col"><b>{d.toPi ?? 0} d</b><span>DO → PI</span></div>
            <div className="rpt-cell col"><b>{d.noPi}</b><span>DOs without PI</span></div>
          </div>
        </Card>
      </div>
    </div>
  )
}
