'use client'
import { useState } from 'react'
import { money } from '@/lib/tas'
import { Bar } from './ReportsHead'

const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '—')
const win = (g) => (g.approved + g.rejected ? g.approved / (g.approved + g.rejected) : -1)
// Sortable columns: key -> value to sort by. Text sorts A–Z first, numbers largest first.
const COLS = [
  ['name', null, (g) => g.name.toLowerCase()],
  ['quotes', 'Quotes', (g) => g.quotes],
  ['approved', 'Approved', (g) => g.approved],
  ['pending', 'Pending', (g) => g.pending],
  ['rejected', 'Rejected', (g) => g.rejected],
  ['cancelled', 'Cancelled', (g) => g.cancelled],
  ['win', 'Win rate', win],
  ['avg', 'Avg quote (SAR)', (g) => g.quoted / g.quotes],
]

// Quotes per salesperson or customer in the period. rows come from sales().bySales / .byCustomer
// (already by approved value); a click on a header sorts by that column, a second click reverses it.
export default function SalesTable({ title, icon, rows, nameLabel, showCode, empty, children }) {
  const [sort, setSort] = useState({ key: 'value', desc: true })
  const max = Math.max(...rows.map((g) => g.value), 1)
  const sum = (k) => rows.reduce((s, g) => s + g[k], 0)
  const of = [...COLS, ['value', null, (g) => g.value]].find(([k]) => k === sort.key)[2]
  const sorted = [...rows].sort((a, b) => {
    const x = of(a)
    const y = of(b)
    const c = typeof x === 'string' ? x.localeCompare(y) : x - y
    return sort.desc ? -c : c
  })
  const th = (key, label, cls) => {
    const on = sort.key === key
    return (
      <th className={cls} aria-sort={on ? (sort.desc ? 'descending' : 'ascending') : 'none'}>
        <button type="button" className="th-sort" onClick={() => setSort({ key, desc: on ? !sort.desc : key !== 'name' })}>
          {label}<i className={`ph ${on ? (sort.desc ? 'ph-caret-down' : 'ph-caret-up') : 'ph-caret-up-down'}`} aria-hidden="true" />
        </button>
      </th>
    )
  }
  return (
    <div className="card">
      <div className="tbl-top">
        <h2 className="tbl-ttl"><i className={`ph ${icon}`} />{title} <span className="badge b-none">{rows.length}</span></h2>
        {children}
      </div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              {th('name', nameLabel)}{showCode && <th>Code</th>}
              {COLS.slice(1).map(([k, l]) => th(k, l, 'r'))}
              {th('value', 'Approved value (SAR)', 'c-bar')}
            </tr>
          </thead>
          <tbody>
            {sorted.map((g) => (
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
