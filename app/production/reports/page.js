import { db, fetchAll, requireRole } from '@/lib/server'
import { invMasters, storeLabel } from '@/lib/inventory'
import { SHIFTS, prodMissing } from '@/lib/production'
import { day, money, qty, today } from '@/lib/tas'
import ProdTabs from '../ProdTabs'

export const metadata = { title: 'Production Reports' }
const isDay = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || '')
const pct = (a, b) => (b > 0 ? `${(Math.round((a / b) * 1000) / 10).toFixed(1)}%` : '—')

// Output per day / shift / line, and per line: RM issued vs used, what is left on the line, and kg used per M2 made.
export default async function Reports({ searchParams }) {
  const sp = await searchParams
  const to = isDay(sp.to) ? sp.to : today()
  const from = isDay(sp.from) && sp.from <= to ? sp.from : `${to.slice(0, 8)}01`
  const [, missing, { stores }, items, moves, { data: wipNow }] = await Promise.all([
    requireRole('manager'), prodMissing(), invMasters(),
    fetchAll(() => db().from('production_items').select('good_qty, rejected_qty, qc_pass, qc_b, qc_reject, f:fg_items(m2_per_pc), productions!inner(prod_date, shift, line_store_id)')
      .gte('productions.prod_date', from).lte('productions.prod_date', to)).catch(() => []),
    fetchAll(() => db().from('stock_moves').select('store_id, qty, ref_type').in('ref_type', ['ISSUE', 'USE']).gte('move_date', from).lte('move_date', to)).catch(() => []),
    db().rpc('stock_summary', { p_from: to, p_to: to, p_plant: null, p_store: null }),
  ])
  const line = Object.fromEntries(stores.map((s) => [s.id, s]))
  const wip = stores.filter((s) => s.type === 'WIP')

  // Output, grouped by date + shift + line.
  const out = {}
  for (const { productions: p, ...i } of items) {
    i.p = p
    const k = `${i.p.prod_date}|${i.p.shift}|${i.p.line_store_id}`
    const o = (out[k] ??= { date: i.p.prod_date, shift: i.p.shift, line: i.p.line_store_id, good: 0, m2: 0, rej: 0, pass: 0, b: 0, qcrej: 0 })
    o.good += Number(i.good_qty); o.m2 += i.good_qty * i.f.m2_per_pc; o.rej += Number(i.rejected_qty)
    o.pass += Number(i.qc_pass || 0); o.b += Number(i.qc_b || 0); o.qcrej += Number(i.qc_reject || 0)
  }
  const output = Object.values(out).sort((a, b) => b.date.localeCompare(a.date) || a.shift.localeCompare(b.shift))
  const tot = output.reduce((t, o) => ({ good: t.good + o.good, m2: t.m2 + o.m2, rej: t.rej + o.rej }), { good: 0, m2: 0, rej: 0 })

  // Per line: kg issued in, kg used, kg on the line today, M2 made.
  const perLine = wip.map((s) => {
    const mv = moves.filter((m) => m.store_id === s.id)
    const m2 = output.filter((o) => o.line === s.id).reduce((n, o) => n + o.m2, 0)
    const used = -mv.filter((m) => m.ref_type === 'USE').reduce((n, m) => n + Number(m.qty), 0)
    return {
      s, m2, used,
      issued: mv.filter((m) => m.ref_type === 'ISSUE' && m.qty > 0).reduce((n, m) => n + Number(m.qty), 0),
      onLine: (wipNow || []).filter((r) => r.store_id === s.id).reduce((n, r) => n + Number(r.closing), 0),
    }
  })

  return (
    <>
      <ProdTabs tab="reports" missing={missing} />
      <form className="page-head" action="/production/reports">
        <div className="row">
          <label htmlFor="from" className="sub">From</label>
          <input id="from" type="date" name="from" defaultValue={from} style={{ width: 160 }} />
          <label htmlFor="to" className="sub">to</label>
          <input id="to" type="date" name="to" defaultValue={to} style={{ width: 160 }} />
          <button className="btn btn-ghost btn-sm"><i className="ph ph-check" />Apply</button>
        </div>
      </form>

      <div className="stats">
        <div className="stat"><div className="stat-n">{qty(tot.good)}</div><div className="stat-l">Good pcs</div></div>
        <div className="stat"><div className="stat-n">{money(tot.m2)}</div><div className="stat-l">Good M2</div></div>
        <div className="stat"><div className="stat-n co">{qty(tot.rej)}</div><div className="stat-l">Rejected on line</div></div>
        <div className="stat"><div className="stat-n">{pct(tot.rej, tot.good + tot.rej)}</div><div className="stat-l">Line rejection</div></div>
      </div>

      <div className="card">
        <div className="tbl-top"><h2 className="tbl-ttl"><i className="ph ph-chart-bar" />Output {day(from)} – {day(to)}</h2></div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Date</th><th>Shift</th><th>Line</th><th className="r">Good pcs</th><th className="r">Good M2</th><th className="r">Rejected</th><th className="r">Rejection</th><th className="r">QC pass / B / rej</th></tr></thead>
            <tbody>
              {output.map((o) => (
                <tr key={`${o.date}${o.shift}${o.line}`}>
                  <td className="nowrap">{day(o.date)}</td>
                  <td data-label="Shift">{SHIFTS[o.shift]}</td>
                  <td data-label="Line">{storeLabel(line[o.line])}</td>
                  <td className="num fw6" data-label="Good pcs">{qty(o.good)}</td>
                  <td className="num" data-label="Good M2">{money(o.m2)}</td>
                  <td className="num" data-label="Rejected">{qty(o.rej)}</td>
                  <td className="num" data-label="Rejection">{pct(o.rej, o.good + o.rej)}</td>
                  <td className="num" data-label="QC pass / B / rej">{qty(o.pass)} / {qty(o.b)} / {qty(o.qcrej)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!output.length && <div className="empty"><i className="ph ph-chart-bar" /><h3>No production in this period</h3><p>Pick other dates, or enter production first.</p></div>}
        </div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <div className="tbl-top">
          <h2 className="tbl-ttl"><i className="ph ph-gauge" />Lines: RM issued vs used, and yield</h2>
          <span className="muted text-sm">Mixed units are added as they are (mostly KG). Yield = RM used ÷ good M2 made.</span>
        </div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Line</th><th className="r">RM issued</th><th className="r">RM used</th><th className="r">On the line today</th><th className="r">Good M2</th><th className="r">RM per M2</th></tr></thead>
            <tbody>
              {perLine.map((l) => (
                <tr key={l.s.id}>
                  <td>{storeLabel(l.s)}</td>
                  <td className="num" data-label="RM issued">{qty(l.issued)}</td>
                  <td className="num" data-label="RM used">{qty(l.used)}</td>
                  <td className="num fw6" data-label="On the line today">{qty(l.onLine)}</td>
                  <td className="num" data-label="Good M2">{money(l.m2)}</td>
                  <td className="num" data-label="RM per M2">{l.m2 > 0 && l.used > 0 ? qty(Math.round((l.used / l.m2) * 1000) / 1000) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!perLine.length && <div className="empty"><i className="ph ph-gauge" /><h3>No production lines</h3><p>Add them as stores of type WIP under Settings → Stores.</p></div>}
        </div>
      </div>
    </>
  )
}
