import Link from 'next/link'
import { requireRole } from '@/lib/server'
import { period, waiting } from '@/lib/reports'
import { dmy } from '@/lib/tas'
import ReportsHead from '../ReportsHead'

export const metadata = { title: 'Waiting · Reports' }

// Over 7 days: an icon as well as red, so it doesn't rely on colour alone.
const Late = () => <i className="ph ph-warning" role="img" aria-label="Over 7 days:" title="Waiting over 7 days" style={{ marginRight: 4, verticalAlign: '-2px' }} />

// Everything waiting right now, per queue, oldest first. Over 7 days is shown in red.
export default async function Waiting({ searchParams }) {
  await requireRole('admin')
  const p = period(await searchParams)
  const queues = await waiting()
  return (
    <>
      <ReportsHead tab="waiting" p={p} periodless />

      <div className="card">
        <div className="tbl-top"><h2 className="tbl-ttl"><i className="ph ph-clock" />Summary <span className="hint">— days since the previous step finished</span></h2></div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Queue</th><th>With</th><th className="r">Total</th><th className="r">0–2 days</th><th className="r">3–7 days</th><th className="r">Over 7 days</th></tr></thead>
            <tbody>
              {queues.map((q) => (
                <tr key={q.key}>
                  <td className="fw6 nowrap"><a href={`#${q.key}`}><i className={`ph ${q.icon}`} /> {q.label}</a></td>
                  <td className="muted">{q.who}</td>
                  <td className="num fw6">{q.rows.length}</td><td className="num">{q.fresh}</td><td className="num">{q.week}</td>
                  <td className={`num${q.old ? ' red fw6' : ''}`}>{q.old > 0 && <Late />}{q.old}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {queues.map((q) => (
        <div className="card" id={q.key} key={q.key}>
          <div className="tbl-top">
            <h2 className="tbl-ttl"><i className={`ph ${q.icon}`} />{q.label} <span className="badge b-none">{q.rows.length}</span></h2>
            <Link prefetch={false} className="btn btn-ghost btn-sm" href={q.href}>Open in Orders<i className="ph ph-arrow-right" /></Link>
          </div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr><th>Quote No</th><th>Customer</th><th>Salesperson</th>{q.key === 'pi' && <th>DO No</th>}{q.key === 'tax' && <th>PI No</th>}<th>{q.since}</th><th className="r">Days waiting</th></tr>
              </thead>
              <tbody>
                {q.rows.map((r) => (
                  <tr key={`${r.id}-${r.ref || ''}`}>
                    <td className="nowrap"><Link prefetch={false} className="qno" href={`/orders?view=${r.id}`}>{r.quote_no}</Link></td>
                    <td className="fw6"><bdi>{r.customer_name}</bdi></td>
                    <td className="nowrap">{r.salesperson_name}</td>
                    {(q.key === 'pi' || q.key === 'tax') && <td className="nowrap">{r.ref}</td>}
                    <td className="nowrap muted">{r.since ? dmy(String(r.since).slice(0, 10)) : '—'}</td>
                    <td className={`num${r.age > 7 ? ' red fw6' : ''}`}>{r.age > 7 && <Late />}{r.age}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!q.rows.length && <div className="empty" style={{ padding: '28px 20px' }}><h3>Nothing waiting</h3><p>This queue is clear.</p></div>}
          </div>
        </div>
      ))}
    </>
  )
}
