import Link from 'next/link'

export const REPORTS = [
  { key: '', label: 'Overview', icon: 'ph-squares-four' },
  { key: 'salespeople', label: 'Salespeople', icon: 'ph-user' },
  { key: 'customers', label: 'Customers', icon: 'ph-storefront' },
  { key: 'waiting', label: 'Waiting', icon: 'ph-clock' },
  { key: 'dispatch', label: 'Dispatch', icon: 'ph-truck' },
]

// Tabs, the period every report shares, and this report's downloads. periodless: the report ignores dates.
export default function ReportsHead({ tab, p, exports = [], periodless }) {
  const base = `/admin/reports${tab ? `/${tab}` : ''}`
  return (
    <>
      <nav className="tabs" aria-label="Reports">
        {REPORTS.map((r) => (
          <Link key={r.key} href={`/admin/reports${r.key ? `/${r.key}` : ''}?${p.qs}`} className={`tab${r.key === tab ? ' on' : ''}`} aria-current={r.key === tab ? 'page' : undefined}>
            <i className={`ph ${r.icon}`} />{r.label}
          </Link>
        ))}
      </nav>
      <div className="page-head">
        {periodless ? (
          <span className="muted text-sm"><i className="ph ph-info" /> Shows what is waiting right now, whatever the dates.</span>
        ) : (
          <form className="row" action={base}>
            <label htmlFor="from" className="sub">From</label>
            <input id="from" type="date" name="from" defaultValue={p.from} style={{ width: 160 }} />
            <label htmlFor="to" className="sub">to</label>
            <input id="to" type="date" name="to" defaultValue={p.to} style={{ width: 160 }} />
            <button className="btn btn-ghost btn-sm"><i className="ph ph-arrow-clockwise" />Update</button>
          </form>
        )}
        {exports.length > 0 && (
          <>
            <div className="acts dl-inline">
              <span className="muted text-sm">Download{periodless ? '' : ' for this period'}:</span>
              {exports.map(([k, l]) => (
                <a key={k} className="btn btn-ghost btn-sm" href={`/admin/export/${k}?${p.qs}`}><i className="ph ph-download-simple" />{l}</a>
              ))}
            </div>
            {/* Phones: the same downloads folded into one menu, so the report starts higher up */}
            <details className="dl-menu">
              <summary className="btn btn-ghost btn-sm"><i className="ph ph-download-simple" />Download<i className="ph ph-caret-down" /></summary>
              <div className="dl-list">
                {exports.map(([k, l]) => (
                  <a key={k} className="dl-item" href={`/admin/export/${k}?${p.qs}`}><i className="ph ph-file-csv" />{l}</a>
                ))}
              </div>
            </details>
          </>
        )}
      </div>
    </>
  )
}

// Horizontal bar for a value against the largest in the table.
export const Bar = ({ v, max }) => (
  <div style={{ height: 6, borderRadius: 3, background: 'var(--accent)', width: `${Math.max(2, (v / Math.max(1, max)) * 100)}%`, marginTop: 4 }} />
)
