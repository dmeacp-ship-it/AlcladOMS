import { WARN, getUsage } from '@/lib/usage'

const fmt = (k, n) => (k === 'mau' ? n.toLocaleString('en') : n >= 1e9 ? `${(n / 1e9).toFixed(2)} GB` : `${(n / 1e6).toFixed(1)} MB`)

// Free-plan usage, admins only (Company Settings).
export default async function UsagePanel() {
  const rows = await getUsage()
  return (
    <section className="fsec">
      <h2 className="fsec-ttl"><i className="ph ph-gauge" />Free plan usage</h2>
      {!rows ? <p className="muted text-sm">Run supabase/migrate-012.sql in Supabase to see usage here.</p> : (
        <div className="usage">
          {rows.map((r) => (
            <div key={r.key} className="usage-row">
              <span>{r.label}</span>
              <span className="num">{fmt(r.key, r.used)} / {fmt(r.key, r.max)}</span>
              <div className={`usage-bar${r.share >= WARN ? ' warn' : ''}`} role="progressbar" aria-label={r.label} aria-valuenow={Math.round(r.share * 100)} aria-valuemin={0} aria-valuemax={100}>
                <i style={{ width: `${Math.min(100, r.share * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="muted text-sm" style={{ marginTop: 10 }}>
        Updated hourly. Data transfer (egress, 5 GB a month) is only shown in the{' '}
        <a href="https://supabase.com/dashboard/org/_/usage" target="_blank" rel="noreferrer">Supabase usage page</a>.
      </p>
    </section>
  )
}
