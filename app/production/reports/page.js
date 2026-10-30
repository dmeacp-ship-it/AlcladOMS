import Link from 'next/link'
import { db, fetchAll, requireRole } from '@/lib/server'
import { invMasters, storeLabel } from '@/lib/inventory'
import { SHIFTS, prodMissing } from '@/lib/production'
import { day, money, qty, today } from '@/lib/tas'
import { DateRange, IntentLink, LinkBusy } from '../../ui'
import ProdTabs from '../ProdTabs'

export const metadata = { title: 'Production Reports & Variance' }
const isDay = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || '')
const pct = (a, b) => (b > 0 ? `${(Math.round((a / b) * 1000) / 10).toFixed(1)}%` : '—')

export default async function Reports({ searchParams }) {
  const sp = await searchParams
  const subview = sp.tab || 'output'
  const to = isDay(sp.to) ? sp.to : today()
  const from = isDay(sp.from) && sp.from <= to ? sp.from : `${to.slice(0, 8)}01`

  const [, missing, { stores, materials }, items, moves, { data: wipNow }, varianceRes] = await Promise.all([
    requireRole('manager'),
    prodMissing(),
    invMasters(),
    fetchAll(() =>
      db()
        .from('production_items')
        .select('good_qty, rejected_qty, qc_pass, qc_b, qc_reject, f:fg_items(m2_per_pc), productions!inner(prod_date, shift, line_store_id)')
        .gte('productions.prod_date', from)
        .lte('productions.prod_date', to)
    ).catch(() => []),
    fetchAll(() =>
      db()
        .from('stock_moves')
        .select('store_id, qty, ref_type')
        .in('ref_type', ['ISSUE', 'USE'])
        .gte('move_date', from)
        .lte('move_date', to)
    ).catch(() => []),
    db().rpc('stock_summary', { p_from: to, p_to: to, p_plant: null, p_store: null }),
    db()
      .from('production_consumptions')
      .select('*, p:productions!inner(id, prod_date, shift, dpr_no, by_name, line:stores(id, name, plant_code)), m:materials(id, code, name, uom, cost_price), sm:materials!suggested_mat_id(id, code, name)')
      .gte('p.prod_date', from)
      .lte('p.prod_date', to)
      .order('id', { ascending: false })
      // Query builders are thenables without .catch()
      .then((r) => r, () => ({ data: [] })),
  ])

  const line = Object.fromEntries(stores.map((s) => [s.id, s]))
  const wip = stores.filter((s) => s.type === 'WIP')
  const varianceList = varianceRes?.data || []

  // 1. Output, grouped by date + shift + line
  const out = {}
  for (const { productions: p, ...i } of items) {
    i.p = p
    const k = `${i.p.prod_date}|${i.p.shift}|${i.p.line_store_id}`
    const o = (out[k] ??= { date: i.p.prod_date, shift: i.p.shift, line: i.p.line_store_id, good: 0, m2: 0, rej: 0, pass: 0, b: 0, qcrej: 0 })
    o.good += Number(i.good_qty)
    o.m2 += i.good_qty * (i.f?.m2_per_pc || 0)
    o.rej += Number(i.rejected_qty)
    o.pass += Number(i.qc_pass || 0)
    o.b += Number(i.qc_b || 0)
    o.qcrej += Number(i.qc_reject || 0)
  }
  const output = Object.values(out).sort((a, b) => b.date.localeCompare(a.date) || a.shift.localeCompare(b.shift))
  const tot = output.reduce((t, o) => ({ good: t.good + o.good, m2: t.m2 + o.m2, rej: t.rej + o.rej }), { good: 0, m2: 0, rej: 0 })

  // 2. Per line stats
  const perLine = wip.map((s) => {
    const mv = moves.filter((m) => m.store_id === s.id)
    const m2 = output.filter((o) => o.line === s.id).reduce((n, o) => n + o.m2, 0)
    const used = -mv.filter((m) => m.ref_type === 'USE').reduce((n, m) => n + Number(m.qty), 0)
    return {
      s,
      m2,
      used,
      issued: mv.filter((m) => m.ref_type === 'ISSUE' && m.qty > 0).reduce((n, m) => n + Number(m.qty), 0),
      onLine: (wipNow || []).filter((r) => r.store_id === s.id).reduce((n, r) => n + Number(r.closing), 0),
    }
  })

  // 3. Variance summary totals
  const totalSystemQty = varianceList.reduce((sum, v) => sum + Number(v.system_qty || 0), 0)
  const totalActualQty = varianceList.reduce((sum, v) => sum + Number(v.actual_qty || 0), 0)
  const totalDiffQty = totalActualQty - totalSystemQty
  const totalVarianceSar = varianceList.reduce((sum, v) => {
    const diff = Number(v.actual_qty || 0) - Number(v.system_qty || 0)
    const cost = Number(v.m?.cost_price || 0)
    return sum + (diff * cost)
  }, 0)
  const overThresholdCount = varianceList.filter((v) => Math.abs(Number(v.diff_pct || 0)) > 5.0).length

  const baseHref = (p) => {
    const q = new URLSearchParams()
    if (p.tab) q.set('tab', p.tab)
    if (from) q.set('from', from)
    if (to) q.set('to', to)
    return `/production/reports?${q.toString()}`
  }

  return (
    <>
      <ProdTabs tab="reports" missing={missing} />

      {/* ── Sub Navigation Tabs ── */}
      <div className="card" style={{ marginBottom: 12, padding: '10px 16px' }}>
        <div className="d-flex jc-sb ai-c f-wrap gap-12">
          <nav className="tabs tabs-dynamic m-0" aria-label="Report Views">
            <IntentLink href={baseHref({ tab: 'output' })} className={`tab${subview === 'output' ? ' on' : ''}`}>
              <LinkBusy />
              <i className="ph ph-chart-bar" />
              <span>Output &amp; Yield</span>
            </IntentLink>

            <IntentLink href={baseHref({ tab: 'variance' })} className={`tab${subview === 'variance' ? ' on' : ''}`}>
              <LinkBusy />
              <i className="ph ph-scales" />
              <span>Consumption Variance (BOM vs Actual)</span>
              {overThresholdCount > 0 && <span className="badge b-danger">{overThresholdCount} &gt;5%</span>}
            </IntentLink>
          </nav>

          <form className="page-head" action="/production/reports" style={{ margin: 0, padding: 0 }}>
            <input type="hidden" name="tab" value={subview} />
            <DateRange from={from} to={to} />
          </form>
        </div>
      </div>

      {/* ── VIEW 1: Output & Yield ── */}
      {subview === 'output' && (
        <>
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

          <div className="card mt-20">
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
      )}

      {/* ── VIEW 2: Material Consumption Variance (BOM vs Actual) ── */}
      {subview === 'variance' && (
        <>
          <div className="stats">
            <div className="stat">
              <div className="stat-n">{qty(Math.round(totalSystemQty))}</div>
              <div className="stat-l">System BOM (KG/M²)</div>
            </div>
            <div className="stat">
              <div className="stat-n fw7">{qty(Math.round(totalActualQty))}</div>
              <div className="stat-l">Actual Confirmed (KG/M²)</div>
            </div>
            <div className="stat">
              <div className={`stat-n ${totalDiffQty > 0 ? 'co' : ''}`}>
                {totalDiffQty > 0 ? `+${qty(Math.round(totalDiffQty))}` : qty(Math.round(totalDiffQty))}
              </div>
              <div className="stat-l">Net Quantity Variance</div>
            </div>
            <div className="stat">
              <div className={`stat-n ${totalVarianceSar > 0 ? 'co' : ''}`}>
                {totalVarianceSar !== 0 ? `${money(totalVarianceSar)} SAR` : '0 SAR'}
              </div>
              <div className="stat-l">Variance Value (SAR)</div>
            </div>
          </div>

          <div className="card">
            <div className="tbl-top">
              <h2 className="tbl-ttl">
                <i className="ph ph-scales" />Material Consumption Variance {day(from)} – {day(to)}
                <span className="badge b-none">{varianceList.length} rows</span>
              </h2>
              <span className="muted text-sm">
                Red rows highlight variances greater than 5% with mandatory supervisor reasons
              </span>
            </div>

            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Date &amp; Shift</th>
                    <th>DPR No</th>
                    <th>Line</th>
                    <th>Layer</th>
                    <th>Material Used</th>
                    <th className="r">System BOM</th>
                    <th className="r">Actual Used</th>
                    <th className="r">Difference</th>
                    <th className="r">Value (SAR)</th>
                    <th>Reason / Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {varianceList.length === 0 ? (
                    <tr>
                      <td colSpan={10} style={{ textAlign: 'center', padding: '32px 16px' }} className="muted">
                        <i className="ph ph-receipt" style={{ fontSize: '1.5rem', display: 'block', marginBottom: 6 }} />
                        No material consumption records found in this period. Enter DPR reports to track variance.
                      </td>
                    </tr>
                  ) : (
                    varianceList.map((v) => {
                      const isOver = Math.abs(Number(v.diff_pct || 0)) > 5.0
                      const diffSign = Number(v.diff_qty || 0) > 0 ? '+' : ''
                      const cost = Number(v.m?.cost_price || 0)
                      const sarVal = Math.round(Number(v.diff_qty || 0) * cost * 100) / 100

                      return (
                        <tr key={v.id} style={isOver ? { background: 'rgba(239, 68, 68, 0.05)' } : undefined}>
                          <td className="nowrap">
                            <span className="fw6">{day(v.p?.prod_date)}</span>{' '}
                            <span className="muted text-xs">({SHIFTS[v.p?.shift] || v.p?.shift})</span>
                          </td>

                          <td data-label="DPR No">
                            <Link prefetch={false} href={`/production/dpr?view=${v.p?.id}`} className="font-mono fw6">
                              {v.p?.dpr_no}
                            </Link>
                          </td>

                          <td data-label="Line">{storeLabel(v.p?.line)}</td>

                          <td data-label="Layer">
                            <span className="badge b-none text-xs">{v.layer_type.replace('_', ' ')}</span>
                          </td>

                          <td data-label="Material Used">
                            <div className="mat-name">{v.m?.name || v.material_id}</div>
                            {v.m?.code && <div className="mat-sub">{v.m.code}</div>}
                            {v.sm?.code && v.sm.code !== v.m?.code && (
                              <div className="muted text-xs">Substituted for {v.sm.code}</div>
                            )}
                          </td>

                          <td className="num" data-label="System BOM">
                            <span className="fw6">{qty(v.system_qty)}</span>{' '}
                            <span className="muted text-xs">{v.uom}</span>
                          </td>

                          <td className="num fw7" data-label="Actual Used">
                            {qty(v.actual_qty)} <span className="muted text-xs">{v.uom}</span>
                          </td>

                          <td className="num" data-label="Difference">
                            <span
                              className={`badge ${
                                isOver
                                  ? 'b-danger'
                                  : Math.abs(Number(v.diff_pct || 0)) > 0.05
                                  ? 'b-warn'
                                  : 'b-none'
                              }`}
                              style={{ fontWeight: 600 }}
                            >
                              {diffSign}{Number(v.diff_pct || 0).toFixed(1)}%
                            </span>
                            <div className="muted text-xs mt-2">
                              {diffSign}{qty(v.diff_qty)} {v.uom}
                            </div>
                          </td>

                          <td className="num" data-label="Value (SAR)">
                            {sarVal !== 0 ? (
                              <span className={sarVal > 0 ? 'red fw6' : 'green fw6'}>
                                {sarVal > 0 ? `+${money(sarVal)}` : money(sarVal)}
                              </span>
                            ) : (
                              <span className="muted">—</span>
                            )}
                          </td>

                          <td data-label="Reason / Notes">
                            {v.reason ? (
                              <span style={isOver ? { color: 'var(--red)', fontWeight: 500 } : undefined}>
                                {v.reason}
                              </span>
                            ) : (
                              <span className="muted">—</span>
                            )}
                            {v.p?.by_name && <div className="muted text-xs">by {v.p.by_name}</div>}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  )
}
