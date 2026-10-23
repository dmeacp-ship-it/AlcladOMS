import { pct } from '@/lib/reports'
import { money } from '@/lib/tas'
import { Bar } from './ReportsHead'

// Quotes per salesperson or customer in the period. rows come from sales().bySales / .byCustomer.
export default function SalesTable({ title, icon, rows, nameLabel, showCode, empty, children }) {
  const max = Math.max(...rows.map((g) => g.value), 1)
  const sum = (k) => rows.reduce((s, g) => s + g[k], 0)
  return (
    <div className="card">
      <div className="tbl-top">
        <div className="tbl-ttl"><i className={`ph ${icon}`} />{title} <span className="badge b-none">{rows.length}</span></div>
        {children}
      </div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>{nameLabel}</th>{showCode && <th>Code</th>}
              <th className="r">Quotes</th><th className="r">Approved</th><th className="r">Pending</th><th className="r">Rejected</th><th className="r">Cancelled</th>
              <th className="r">Win rate</th><th className="r">Avg quote (SAR)</th><th style={{ minWidth: 220 }}>Approved value (SAR)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((g) => (
              <tr key={g.name}>
                <td className="fw6"><bdi>{g.name}</bdi></td>{showCode && <td className="nowrap muted">{g.code || '—'}</td>}
                <td className="num">{g.quotes}</td><td className="num">{g.approved}</td><td className="num">{g.pending}</td>
                <td className="num">{g.rejected}</td><td className="num">{g.cancelled}</td>
                <td className="num">{pct(g.approved, g.approved + g.rejected)}</td>
                <td className="num">{money(g.quoted / g.quotes)}</td>
                <td className="num fw6">{money(g.value)}<Bar v={g.value} max={max} /></td>
              </tr>
            ))}
          </tbody>
          {rows.length > 1 && (
            <tfoot>
              <tr className="grp">
                <td className="fw6">Total</td>{showCode && <td />}
                <td className="num fw6">{sum('quotes')}</td><td className="num fw6">{sum('approved')}</td><td className="num fw6">{sum('pending')}</td>
                <td className="num fw6">{sum('rejected')}</td><td className="num fw6">{sum('cancelled')}</td>
                <td className="num fw6">{pct(sum('approved'), sum('approved') + sum('rejected'))}</td>
                <td className="num fw6">{money(sum('quoted') / sum('quotes'))}</td>
                <td className="num fw6">{money(sum('value'))}</td>
              </tr>
            </tfoot>
          )}
        </table>
        {!rows.length && <div className="empty"><i className={`ph ${icon}`} /><h3>{empty}</h3><p>Pick a wider date range.</p></div>}
      </div>
    </div>
  )
}
