import Link from 'next/link'
import { db, requireRole } from '@/lib/server'
import { activityQuery, stamp } from '@/lib/activity'

export const metadata = { title: 'Activity Log' }
const PAGE = 100

// Every recorded action across all orders, plus settings, user and import changes.
export default async function Activity({ searchParams }) {
  await requireRole('admin')
  const sp = await searchParams
  const page = Math.max(0, parseInt(sp.page) || 0)
  const filters = Object.fromEntries(['q', 'user', 'action', 'from', 'to'].filter((k) => sp[k]).map((k) => [k, sp[k]]))
  const [{ data: rows, count, error }, { data: names }] = await Promise.all([
    activityQuery(filters, { count: true }).range(page * PAGE, page * PAGE + PAGE - 1),
    db().from('order_events').select('by_name, action').order('id', { ascending: false }).limit(5000),
  ])
  const users = [...new Set((names || []).map((r) => r.by_name).filter(Boolean))].sort()
  const actions = [...new Set((names || []).map((r) => r.action))].sort()
  const link = (p) => `/admin/activity?${new URLSearchParams({ ...filters, ...(p && { page: p }) })}`
  const select = (name, label, list) => (
    <select name={name} defaultValue={filters[name] || ''} aria-label={label} style={{ width: 170 }}>
      <option value="">{label}</option>
      {list.map((v) => <option key={v}>{v}</option>)}
    </select>
  )

  return (
    <div className="card">
      <div className="tbl-top">
        <div className="tbl-ttl"><i className="ph ph-clock-counter-clockwise" />Activity <span className="badge b-none">{count ?? 0}</span></div>
        <form className="tbl-filters">
          <div className="sw">
            <i className="ph ph-magnifying-glass" />
            <input className="tsearch" name="q" defaultValue={filters.q} placeholder="Search details, e.g. Q-2026-001" aria-label="Search activity" />
          </div>
          {select('user', 'All users', users)}
          {select('action', 'All actions', actions)}
          <input type="date" name="from" defaultValue={filters.from} aria-label="From date" style={{ width: 150 }} />
          <input type="date" name="to" defaultValue={filters.to} aria-label="To date" style={{ width: 150 }} />
          <button className="btn btn-ghost btn-sm"><i className="ph ph-funnel" />Filter</button>
          {Object.keys(filters).length > 0 && <Link className="btn btn-ghost btn-sm neutral" href="/admin/activity">Clear</Link>}
          <a className="btn btn-ghost btn-sm" href={`/admin/export/activity?${new URLSearchParams(filters)}`}><i className="ph ph-download-simple" />Export</a>
        </form>
      </div>
      {error && <div className="banner error" style={{ margin: '0 20px 16px' }} title={error.message}><i className="ph ph-warning-circle" />Couldn't load the activity log. Press Refresh to try again.</div>}
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>When</th><th>User</th><th>Action</th><th>Order</th><th>Details</th></tr></thead>
          <tbody>
            {rows?.map((e) => (
              <tr key={e.id}>
                <td className="nowrap muted">{stamp(e.at)}</td>
                <td className="nowrap fw6">{e.by_name || <span className="muted">—</span>}</td>
                <td className="nowrap">{e.action}</td>
                <td className="nowrap">{e.order ? <Link className="qno" href={`/orders?view=${e.order_id}`}>{e.order.quote_no}</Link> : <span className="muted">—</span>}</td>
                <td style={{ minWidth: 280 }}>{e.detail || <span className="muted">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows?.length && !error && (
          <div className="empty">
            <i className="ph ph-clock-counter-clockwise" />
            <h3>No activity found</h3>
            <p>{Object.keys(filters).length ? 'Nothing matches these filters.' : 'Actions show up here as people use the app.'}</p>
          </div>
        )}
      </div>
      {(count ?? 0) > PAGE && (
        <div className="tbl-foot center">
          {page > 0 ? <Link className="btn btn-ghost btn-sm" href={link(page - 1)}><i className="ph ph-caret-left" />Newer</Link> : <span />}
          <span className="spacer muted text-sm c">{page * PAGE + 1}–{Math.min((page + 1) * PAGE, count)} of {count}</span>
          {(page + 1) * PAGE < count && <Link className="btn btn-ghost btn-sm" href={link(page + 1)}>Older<i className="ph ph-caret-right" /></Link>}
        </div>
      )}
    </div>
  )
}
