import { WARN, readUsage } from '@/lib/usage'

const fmt = (k, n) => (k === 'mau' ? n.toLocaleString('en') : n >= 1e9 ? `${(n / 1e9).toFixed(2)} GB` : `${(n / 1e6).toFixed(1)} MB`)

// Free-plan usage, admins only (Company Settings), read fresh each visit.
export default async function UsagePanel() {
  const rows = await readUsage()
  if (!rows) console.warn('Usage panel: run supabase/migrate-012.sql to enable it.')
  return (
    <div style={{ maxWidth: 700 }}>
      {!rows ? <p className="muted text-sm">Usage figures aren't available yet.</p> : (
        <div className="usage">
          {rows.map((r) => (
            <div key={r.key} className="usage-row">
              <span className="fw5">{r.label}</span>
              <span className="num fw6">{fmt(r.key, r.used)} / {fmt(r.key, r.max)}</span>
              <div className={`usage-bar${r.share >= WARN ? ' warn' : ''}`} role="progressbar" aria-label={r.label} aria-valuenow={Math.round(r.share * 100)} aria-valuemin={0} aria-valuemax={100}>
                <i style={{ width: `${Math.min(100, r.share * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="muted text-sm mt-14">
        Updated hourly. Data transfer (egress, 5 GB a month) is only shown in the{' '}
        <a href="https://supabase.com/dashboard/org/_/usage" target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>Supabase usage page</a>.
      </p>
    </div>
  )
}
