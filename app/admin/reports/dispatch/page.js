import Link from 'next/link'
import { requireRole } from '@/lib/server'
import { dispatch, period } from '@/lib/reports'
import { dmy, int, money } from '@/lib/tas'
import ReportsHead from '../ReportsHead'

export const metadata = { title: 'Dispatch · Reports' }

const daysCell = (v) => (v == null ? <span className="muted">—</span> : v)

// Delivery Orders dated in the period, with how long each step took.
export default async function Dispatch({ searchParams }) {
  await requireRole('manager') // admin + manager
  const p = period(await searchParams)
  const d = await dispatch(p)
  return (
    <>
      <ReportsHead tab="dispatch" p={p} exports={[['dispatches', 'Dispatches'], ['invoices', 'Invoices']]} />

      <div className="stats">
        {[
          ['ph-truck', 'ca', d.rows.length, 'Delivery orders'],
          ['ph-package', 'ct', int(d.pcs), 'PCS on DOs'],
          ['ph-ruler', 'ct', money(d.m2), 'M2 on DOs'],
          ['ph-timer', 'ca', d.toDo ?? '—', 'Days to first DO'],
          ['ph-receipt', 'co', d.toPi ?? '—', 'Days DO → PI'],
          ['ph-hourglass', d.noPi ? 'cr' : 'cg', d.noPi, 'DOs without PI'],
        ].map(([ic, cls, n, l]) => (
          <div key={l} className="stat"><i className={`ph ${ic} stat-ic ${cls}`} /><div className={`stat-n ${cls}`}>{n}</div><div className="stat-l">{l}</div></div>
        ))}
      </div>

      <div className="card">
        <div className="tbl-top"><h2 className="tbl-ttl"><i className="ph ph-truck" />Delivery orders <span className="badge b-none">{d.rows.length}</span></h2></div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>DO No</th><th>DO Date</th><th>Quote No</th><th>Customer</th><th>Vehicle</th>
                <th className="r">PCS</th><th className="r">M2</th><th className="r" title="First DO of an order only">Days approval → DO</th>
                <th>PI No</th><th className="r">Days DO → PI</th>
              </tr>
            </thead>
            <tbody>
              {d.rows.map((r) => (
                <tr key={r.id}>
                  <td className="nowrap fw6">{r.do_no}</td>
                  <td className="nowrap muted">{dmy(r.do_date)}</td>
                  <td className="nowrap"><Link prefetch={false} className="qno" href={`/orders?view=${r.order?.id}`}>{r.order?.quote_no}</Link></td>
                  <td className="fw6"><bdi>{r.order?.customer_name}</bdi></td>
                  <td className="nowrap">{r.vehicle_no || <span className="muted">—</span>}</td>
                  <td className="num">{int(r.pcs)}</td>
                  <td className="num">{money(r.m2)}</td>
                  <td className="num">{daysCell(r.toDo)}</td>
                  <td className="nowrap">{r.pi_no || <span className="badge b-warn">Pending PI</span>}</td>
                  <td className="num">{daysCell(r.toPi)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!d.rows.length && <div className="empty"><i className="ph ph-truck" /><h3>No delivery orders in this period</h3><p>Pick a wider date range.</p></div>}
        </div>
      </div>
    </>
  )
}
