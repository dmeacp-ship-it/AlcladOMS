import Link from 'next/link'
import { LinkBusy } from '../../ui'
import { db, requireRole } from '@/lib/server'
import { activityQuery, stamp } from '@/lib/activity'

export const metadata = { title: 'Activity Log' }
const PAGE = 100

// Every recorded action across all orders, plus settings, user and import changes.
export default async function Activity({ searchParams }) {
  const sp = await searchParams
  const page = Math.max(0, parseInt(sp.page) || 0)
  const filters = Object.fromEntries(['q', 'user', 'action', 'from', 'to'].filter((k) => sp[k]).map((k) => [k, sp[k]]))
  // Role check, this page of events and the two filter lists in one round trip (activity_filters: migrate-014).
  const [, { data: rows, count, error }, { data: lists }] = await Promise.all([
    requireRole('admin'),
    activityQuery(filters, { count: true }).range(page * PAGE, page * PAGE + PAGE - 1),
    db().rpc('activity_filters'),
  ])
  let { users = [], actions = [] } = lists || {}
  if (!lists) {
    // Until migrate-014 runs: the names and actions in the latest 5,000 events.
    const { data: names } = await db().from('order_events').select('by_name, action').order('id', { ascending: false }).limit(5000)
    users = [...new Set((names || []).map((r) => r.by_name).filter(Boolean))].sort()
    actions = [...new Set((names || []).map((r) => r.action))].sort()
  }
  const link = (p) => `/admin/activity?${new URLSearchParams({ ...filters, ...(p && { page: p }) })}`
  const select = (name, label, list) => (
    <select name={name} defaultValue={filters[name] || ''} aria-label={label} className="flt-sel">
      <option value="">{label}</option>
      {list.map((v) => <option key={v}>{v}</option>)}
    </select>
  )

  return (
    <div className="card">
      <div className="tbl-top">
        <h2 className="tbl-ttl"><i className="ph ph-clock-counter-clockwise" />Activity <span className="badge b-none">{count ?? 0}</span></h2>
        {/* Phones: the filters fold behind one button that says how many are on */}
        <input type="checkbox" id="flt-toggle" className="flt-toggle sr-only" aria-label="Show filters" />
        <label htmlFor="flt-toggle" className="btn btn-ghost btn-sm flt-btn"><i className="ph ph-funnel" />Filters{Object.keys(filters).length ? ` (${Object.keys(filters).length})` : ''}</label>
        <form className="tbl-filters flt-body">
          <div className="sw">
            <i className="ph ph-magnifying-glass" />
            <input className="tsearch" name="q" defaultValue={filters.q} placeholder="Search details, e.g. Q-2026-001" aria-label="Search activity" />
          </div>
          {select('user', 'All users', users)}
          {select('action', 'All actions', actions)}
          <input type="date" name="from" defaultValue={filters.from} aria-label="From date" className="flt-date" />
          <input type="date" name="to" defaultValue={filters.to} aria-label="To date" className="flt-date" />
          <button className="btn btn-ghost btn-sm"><i className="ph ph-funnel" />Filter</button>
          {Object.keys(filters).length > 0 && <Link prefetch={false} className="btn btn-ghost btn-sm neutral" href="/admin/activity"><LinkBusy />Clear</Link>}
          <a className="btn btn-ghost btn-sm" href={`/admin/export/activity?${new URLSearchParams(filters)}`}><i className="ph ph-download-simple" />Export</a>
        </form>
      </div>
      {error && <div className="banner error" style={{ margin: '0 20px 16px' }} title={error.message}><i className="ph ph-warning-circle" />Couldn't load the activity log. Press Refresh to try again.</div>}
      <div className="tbl-wrap">
        <table className="tbl activity-tbl">
          <thead><tr><th>When</th><th>User</th><th>Action</th><th>Order</th><th>Details</th></tr></thead>
          <tbody>
            {rows?.map((e) => (
              <tr key={e.id}>
                <td className="nowrap muted c-when">{stamp(e.at)}</td>
                <td className="nowrap fw6 c-user">{e.by_name || <span className="muted">—</span>}</td>
                <td className="nowrap c-action">{e.action}</td>
                <td className="nowrap c-order">{e.order ? <Link prefetch={false} className="qno" href={`/orders?view=${e.order_id}`}>{e.order.quote_no}</Link> : <span className="muted">—</span>}</td>
                <td className="c-detail">{e.detail || <span className="muted">—</span>}</td>
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
          {page > 0 ? <Link prefetch={false} className="btn btn-ghost btn-sm" href={link(page - 1)}><LinkBusy /><i className="ph ph-caret-left" />Newer</Link> : <span />}
          <span className="spacer muted text-sm c">{page * PAGE + 1}–{Math.min((page + 1) * PAGE, count)} of {count}</span>
          {(page + 1) * PAGE < count && <Link prefetch={false} className="btn btn-ghost btn-sm" href={link(page + 1)}><LinkBusy />Older<i className="ph ph-caret-right" /></Link>}
        </div>
      )}
    </div>
  )
}
