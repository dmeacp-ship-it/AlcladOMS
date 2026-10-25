import { money } from '@/lib/tas'

// Small server-drawn charts for the Reports overview: one series per chart, plotted to scale from zero.
// The report tables underneath stay the accessible, exact version; the SVG carries a one-line summary.
const W = 560
const H = 200
const PAD = { l: 52, r: 12, t: 14, b: 28 }

// Round the top of the axis up to 1, 2 or 5 × a power of ten, and give four even steps.
function niceMax(v) {
  if (v <= 0) return 1
  const p = 10 ** Math.floor(Math.log10(v))
  const n = v / p
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p
}
const short = (n) => (n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${+(n / 1e3).toFixed(1)}k` : String(+n.toFixed(1)))

export function Chart({ title, points, kind = 'bar', unit = '', summary }) {
  const max = niceMax(Math.max(0, ...points.map((p) => p.value)))
  const iw = W - PAD.l - PAD.r
  const ih = H - PAD.t - PAD.b
  const step = points.length ? iw / points.length : iw
  const x = (i) => PAD.l + step * i + step / 2
  const y = (v) => PAD.t + ih - (v / max) * ih
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max)
  // Every label when they fit, else every second or third so they never collide.
  const every = Math.max(1, Math.ceil(points.length / 8))
  return (
    <figure className="chart">
      <figcaption className="chart-ttl">{title}</figcaption>
      {points.length === 0 ? (
        <p className="muted text-sm chart-empty">No data in this period.</p>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary} preserveAspectRatio="xMidYMid meet">
          {ticks.map((t) => (
            <g key={t}>
              <line className="chart-grid" x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} />
              <text className="chart-axis" x={PAD.l - 8} y={y(t) + 4} textAnchor="end">{short(t)}</text>
            </g>
          ))}
          {kind === 'bar' && points.map((p, i) => (
            <rect key={p.label} className="chart-bar" x={x(i) - Math.min(18, step * 0.3)} width={Math.min(36, step * 0.6)} y={y(p.value)} height={Math.max(0, PAD.t + ih - y(p.value))} rx="3">
              <title>{`${p.label}: ${unit === 'SAR' ? `SAR ${money(p.value)}` : `${+p.value.toFixed(1)} ${unit}`}`}</title>
            </rect>
          ))}
          {kind === 'line' && (
            <>
              <path className="chart-area" d={`M${x(0)},${y(0)} ${points.map((p, i) => `L${x(i)},${y(p.value)}`).join(' ')} L${x(points.length - 1)},${y(0)} Z`} />
              <path className="chart-line" d={points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.value)}`).join(' ')} />
              {points.map((p, i) => (
                <circle key={p.label} className="chart-dot" cx={x(i)} cy={y(p.value)} r={i === points.length - 1 ? 4.5 : 3}>
                  <title>{`${p.label}: ${unit === 'SAR' ? `SAR ${money(p.value)}` : `${p.value} ${unit}`}`}</title>
                </circle>
              ))}
            </>
          )}
          {points.map((p, i) => i % every === 0 && (
            <text key={p.label} className="chart-axis" x={x(i)} y={H - 8} textAnchor="middle">{p.label}</text>
          ))}
        </svg>
      )}
    </figure>
  )
}

// Monday-based weeks between from and to (YYYY-MM-DD), labelled "6 Oct".
export function weeks(from, to) {
  const out = []
  const d = new Date(`${from}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  const end = new Date(`${to}T00:00:00Z`)
  while (d <= end && out.length < 60) {
    const key = d.toISOString().slice(0, 10)
    out.push({ key, label: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) })
    d.setUTCDate(d.getUTCDate() + 7)
  }
  return out
}
// The Monday of a date's week, as YYYY-MM-DD.
export function weekOf(day) {
  const d = new Date(`${String(day).slice(0, 10)}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return d.toISOString().slice(0, 10)
}
