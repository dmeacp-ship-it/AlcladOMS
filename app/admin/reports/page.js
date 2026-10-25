import Link from 'next/link'
import { LinkBusy } from '../../ui'
import { requireRole } from '@/lib/server'
import { dispatch, pct, period, sales, waiting } from '@/lib/reports'
import { int, money } from '@/lib/tas'
import ReportsHead from './ReportsHead'
import { Chart, weekOf, weeks } from './Charts'

// Tiles show money short (SAR 141.3k) so it fits; the full figure is in the tooltip and the reports.
const sar = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e4 ? `${(n / 1e3).toFixed(1)}k` : money(n))

export const metadata = { title: 'Reports' }

// Headline numbers for the period, and a card per report.
export default async function Reports({ searchParams }) {
  await requireRole('manager') // admin + manager
  const p = period(await searchParams)
  const [s, w, d] = await Promise.all([sales(p), waiting(), dispatch(p)])
  const waitingNow = w.reduce((n, q) => n + q.rows.length, 0)
  const overdue = w.reduce((n, q) => n + q.old, 0)
  const top = (list) => list.slice(0, 3).map((g) => g.name).join(', ')
  const n = (k, one, many) => `${k} ${k === 1 ? one : many}`
  // Weekly series for the two charts
  const wk = weeks(p.from, p.to)
  const sum = (rows, keyOf, valOf) => wk.map((w) => ({ label: w.label, value: rows.filter((r) => keyOf(r) === w.key).reduce((t, r) => t + valOf(r), 0) }))
  const valueWeeks = sum(s.orders.filter((o) => o.status === 'APPROVED'), (o) => weekOf(o.quote_date), s.totalOf)
  const pcsWeeks = sum(d.rows, (r) => weekOf(r.do_date), (r) => r.pcs)

  const cards = [
    { key: 'salespeople', icon: 'ph-user', title: 'Salespeople', n: `SAR ${money(s.value)}`,
      sub: s.bySales.length ? `${n(s.bySales.length, 'salesperson', 'salespeople')} · top: ${top(s.bySales)}` : 'No quotes in this period.' },
    { key: 'customers', icon: 'ph-storefront', title: 'Customers', n: n(s.byCustomer.length, 'customer', 'customers'),
      sub: s.byCustomer.length ? `Top by approved value: ${top(s.byCustomer)}` : 'No quotes in this period.' },
    { key: 'waiting', icon: 'ph-clock', title: 'Waiting now', n: `${waitingNow} waiting`,
      sub: overdue ? `${overdue} waiting more than 7 days.` : 'Nothing has waited more than 7 days.' },
    { key: 'dispatch', icon: 'ph-truck', title: 'Dispatch', n: `${int(d.pcs)} PCS`,
      sub: `${n(d.rows.length, 'DO', 'DOs')} · ${d.toDo ?? '—'} days approval → first DO · ${d.toPi ?? '—'} days DO → PI` },
  ]

  return (
    <>
      <ReportsHead tab="" p={p} exports={[['orders', 'Orders'], ['lines', 'Order lines'], ['dispatches', 'Dispatches'], ['invoices', 'Invoices']]} />

      <div className="stats">
        {[
          ['ph-file-text', 'ca', s.orders.length, 'Quotes', 'salespeople'],
          ['ph-seal-check', 'cg', s.approved, 'Approved', 'salespeople'],
          ['ph-percent', 'co', pct(s.approved, s.decided), 'Win rate', 'salespeople'],
          ['ph-currency-circle-dollar', 'cg', sar(s.value), 'Approved SAR', 'customers', `SAR ${money(s.value)}`],
          ['ph-clock', overdue ? 'cr' : 'co', waitingNow, 'Waiting now', 'waiting'],
          ['ph-truck', 'ca', d.toDo ?? '—', 'Days to first DO', 'dispatch'],
          ['ph-package', 'ct', int(d.pcs), 'PCS on DOs', 'dispatch'],
        ].map(([ic, cls, n, l, to, full]) => (
          <Link prefetch={false} key={l} href={`/admin/reports/${to}?${p.qs}`} className="stat" title={full}>
            <LinkBusy />
            <i className={`ph ${ic} stat-ic ${cls}`} /><div className={`stat-n ${cls}`}>{n}</div><div className="stat-l">{l}</div>
          </Link>
        ))}
      </div>

      <div className="charts">
        <Chart title="Approved value per week (SAR)" kind="line" unit="SAR" points={valueWeeks}
          summary={`Approved value per week from ${p.from} to ${p.to}: ${valueWeeks.map((w) => `${w.label} SAR ${money(w.value)}`).join(', ')}`} />
        <Chart title="Pieces on Delivery Orders per week" kind="bar" unit="PCS" points={pcsWeeks}
          summary={`Pieces on Delivery Orders per week: ${pcsWeeks.map((w) => `${w.label} ${w.value}`).join(', ')}`} />
      </div>

      <div className="rcards">
        {cards.map((c) => (
          <Link prefetch={false} key={c.key} href={`/admin/reports/${c.key}?${p.qs}`} className="rcard">
            <LinkBusy />
            <h2 className="rcard-ttl"><i className={`ph ${c.icon}`} />{c.title}</h2>
            <div className="rcard-n">{c.n}</div>
            <div className="rcard-sub"><bdi>{c.sub}</bdi></div>
            <div className="rcard-go">Open report <i className="ph ph-arrow-right" /></div>
          </Link>
        ))}
      </div>
    </>
  )
}
