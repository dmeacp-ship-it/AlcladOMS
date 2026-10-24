import Link from 'next/link'
import { requireRole } from '@/lib/server'
import { dispatch, pct, period, sales, waiting } from '@/lib/reports'
import { int, money } from '@/lib/tas'
import ReportsHead from './ReportsHead'

export const metadata = { title: 'Reports' }

// Headline numbers for the period, and a card per report.
export default async function Reports({ searchParams }) {
  await requireRole('admin')
  const p = period(await searchParams)
  const [s, w, d] = await Promise.all([sales(p), waiting(), dispatch(p)])
  const waitingNow = w.reduce((n, q) => n + q.rows.length, 0)
  const overdue = w.reduce((n, q) => n + q.old, 0)
  const top = (list) => list.slice(0, 3).map((g) => g.name).join(', ')
  const n = (k, one, many) => `${k} ${k === 1 ? one : many}`

  const cards = [
    { key: 'salespeople', icon: 'ph-user', title: 'Salespeople', n: `SAR ${money(s.value)}`,
      sub: s.bySales.length ? `${n(s.bySales.length, 'salesperson', 'salespeople')} · top: ${top(s.bySales)}` : 'No quotes in this period.' },
    { key: 'customers', icon: 'ph-storefront', title: 'Customers', n: n(s.byCustomer.length, 'customer', 'customers'),
      sub: s.byCustomer.length ? `Top by approved value: ${top(s.byCustomer)}` : 'No quotes in this period.' },
    { key: 'waiting', icon: 'ph-clock', title: 'Waiting now', n: `${waitingNow} waiting`,
      sub: overdue ? `${overdue} waiting more than 7 days.` : 'Nothing has waited more than 7 days.' },
    { key: 'dispatch', icon: 'ph-truck', title: 'Dispatch', n: `${int(d.pcs)} PCS`,
      sub: `${n(d.rows.length, 'DO', 'DOs')} ·${d.toDo ?? '—'} days approval → first DO · ${d.toPi ?? '—'} days DO → PI` },
  ]

  return (
    <>
      <ReportsHead tab="" p={p} exports={[['orders', 'Orders'], ['lines', 'Order lines'], ['dispatches', 'Dispatches'], ['invoices', 'Invoices']]} />

      <div className="stats">
        {[
          ['ph-file-text', 'ca', s.orders.length, 'Quotes', 'salespeople'],
          ['ph-seal-check', 'cg', s.approved, 'Approved', 'salespeople'],
          ['ph-percent', 'co', pct(s.approved, s.decided), 'Win rate', 'salespeople'],
          ['ph-currency-circle-dollar', 'cg', money(s.value), 'Approved SAR', 'customers'],
          ['ph-clock', overdue ? 'cr' : 'co', waitingNow, 'Waiting now', 'waiting'],
          ['ph-truck', 'ca', d.toDo ?? '—', 'Days to first DO', 'dispatch'],
          ['ph-package', 'ct', int(d.pcs), 'PCS on DOs', 'dispatch'],
        ].map(([ic, cls, n, l, to]) => (
          <Link prefetch={false} key={l} href={`/admin/reports/${to}?${p.qs}`} className="stat">
            <i className={`ph ${ic} stat-ic ${cls}`} /><div className={`stat-n ${cls}`}>{n}</div><div className="stat-l">{l}</div>
          </Link>
        ))}
      </div>

      <div className="rcards">
        {cards.map((c) => (
          <Link prefetch={false} key={c.key} href={`/admin/reports/${c.key}?${p.qs}`} className="rcard">
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
