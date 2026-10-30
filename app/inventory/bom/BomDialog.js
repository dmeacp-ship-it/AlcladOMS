'use client'

import { useState } from 'react'
import Link from 'next/link'
import { money, qty } from '@/lib/tas'
import { RouteDialog } from '../../ui'

export default function BomDialog({ bom, closeHref }) {
  const [pcs, setPcs] = useState(1000)
  const [width, setWidth] = useState(1250)
  const [length, setLength] = useState(2440)
  const [customM2, setCustomM2] = useState('')

  if (!bom) return null

  // Calculate panel m2
  const sheetM2 = (Number(width) * Number(length)) / 1000000
  const totalM2 = customM2 !== '' && !Number.isNaN(Number(customM2))
    ? Number(customM2)
    : Math.round(Number(pcs || 0) * sheetM2 * 100) / 100

  // Calculate layer requirements
  const items = (bom.items || []).map((item) => {
    const rate = Number(item.qty_per_m2 || 0)
    const scrapPct = Number(item.scrap_pct || 0)
    const net = totalM2 * rate
    const scrap = net * (scrapPct / 100)
    const total = net + scrap
    const rateWithScrap = rate * (1 + scrapPct / 100)

    return {
      ...item,
      rateWithScrap,
      net: Math.round(net * 100) / 100,
      scrap: Math.round(scrap * 100) / 100,
      total: Math.round(total * 100) / 100,
    }
  })

  const totalKgPerM2 = items
    .filter((i) => i.uom === 'KG')
    .reduce((sum, i) => sum + i.rateWithScrap, 0)

  const totalBatchKg = items
    .filter((i) => i.uom === 'KG')
    .reduce((sum, i) => sum + i.total, 0)

  const issueParams = new URLSearchParams()
  issueParams.set('notes', `BOM Requisition: ${bom.name} (${money(totalM2)} M2)`)

  const footer = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
      <div className="text-sm muted">
        Standard RM weight: <b>{money(totalKgPerM2)} kg/m²</b> · Total batch: <b>{qty(totalBatchKg)} kg</b>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Link href={closeHref} className="btn btn-subtle btn-sm">Close</Link>
        <Link
          href={`/inventory/issue/new?${issueParams.toString()}`}
          className="btn btn-primary btn-sm"
        >
          <i className="ph ph-arrows-left-right" />Issue to Line
        </Link>
      </div>
    </div>
  )

  return (
    <RouteDialog
      key={bom.id}
      icon="ph-receipt"
      title={<>{bom.name}</>}
      footer={footer}
      closeHref={closeHref}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* ── Recipe Header Card ── */}
        <div style={{ background: 'var(--surface-sunken)', padding: '14px 18px', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span className="badge b-teal fw7">{bom.code}</span>
                <span className="badge b-ok">Active Formula</span>
                <span className="badge b-blue">{bom.grade} Grade</span>
              </div>
              <p className="muted text-sm" style={{ margin: 0 }}>{bom.description || 'Parametric ACP recipe for automated raw material calculation.'}</p>
            </div>
            <div style={{ display: 'flex', gap: 16, textAlign: 'right' }}>
              <div>
                <span className="muted text-xs block">Total Thickness</span>
                <span className="fw7 text-lg">{bom.thickness} mm</span>
              </div>
              <div>
                <span className="muted text-xs block">Top Skin</span>
                <span className="fw7 text-lg">{bom.top_skin} mm</span>
              </div>
              <div>
                <span className="muted text-xs block">Core Layer</span>
                <span className="fw7 text-lg" style={{ color: 'var(--accent)' }}>
                  {bom.core_thick || Math.round((bom.thickness - bom.top_skin - bom.bottom_skin) * 100) / 100} mm
                </span>
              </div>
              <div>
                <span className="muted text-xs block">Bottom Skin</span>
                <span className="fw7 text-lg">{bom.bottom_skin} mm</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Layer Recipe Specification Table ── */}
        <div className="card" style={{ margin: 0 }}>
          <div className="tbl-top">
            <h3 className="tbl-ttl"><i className="ph ph-stack" />Standard Recipe Layers &amp; Consumption</h3>
            <span className="badge b-none">{items.length} layers</span>
          </div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Layer</th>
                  <th>Category</th>
                  <th>Default Material</th>
                  <th>Calculation Rule</th>
                  <th className="r">Rate / M²</th>
                  <th className="r">Scrap %</th>
                  <th className="r">Total Rate</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id}>
                    <td>
                      <span className="mat-name">{it.layer_name}</span>
                      <span className="mat-sub">{it.layer_type}</span>
                    </td>
                    <td>
                      <span className={`badge ${it.category === 'RM' ? 'b-blue' : it.category === 'GRANULE' ? 'b-teal' : 'b-gray'}`}>
                        {it.category}
                      </span>
                    </td>
                    <td>
                      {it.mat?.name || it.mat_code || <span className="muted">—</span>}
                      {it.mat?.code && <span className="mat-sub">{it.mat.code}</span>}
                    </td>
                    <td className="text-xs muted font-mono">{it.calc_formula || 'Standard factor'}</td>
                    <td className="num fw6">{money(it.qty_per_m2)} {it.uom}</td>
                    <td className="num muted">+{it.scrap_pct}%</td>
                    <td className="num fw7" style={{ color: 'var(--ink)' }}>
                      {money(it.rateWithScrap)} {it.uom}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th colSpan={4} className="fw7">Total Standard Weight per M²</th>
                  <th colSpan={3} className="num fw7" style={{ color: 'var(--accent)', fontSize: '1rem' }}>
                    {money(totalKgPerM2)} KG / M²
                  </th>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* ── Interactive Live Batch Requisition Calculator ── */}
        <div className="card" style={{ margin: 0, border: '1px solid var(--accent-light, #ffd8db)' }}>
          <div className="tbl-top" style={{ background: 'var(--surface-sunken)', borderBottom: '1px solid var(--border)' }}>
            <h3 className="tbl-ttl" style={{ color: 'var(--accent)' }}>
              <i className="ph ph-lightning" />Batch Material Calculator &amp; Requisition
            </h3>
            <div className="text-xs muted">Instant calculation for production shift orders</div>
          </div>
          <div style={{ padding: '14px 18px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, borderBottom: '1px solid var(--border)' }}>
            <div>
              <label className="text-xs muted block mb-1">Sheets (Pcs)</label>
              <input
                type="number"
                min="1"
                className="tsearch"
                style={{ width: '100%', padding: '6px 10px' }}
                value={pcs}
                onChange={(e) => {
                  setPcs(e.target.value)
                  setCustomM2('')
                }}
              />
            </div>
            <div>
              <label className="text-xs muted block mb-1">Width (mm)</label>
              <input
                type="number"
                min="500"
                step="10"
                className="tsearch"
                style={{ width: '100%', padding: '6px 10px' }}
                value={width}
                onChange={(e) => {
                  setWidth(e.target.value)
                  setCustomM2('')
                }}
              />
            </div>
            <div>
              <label className="text-xs muted block mb-1">Length (mm)</label>
              <input
                type="number"
                min="500"
                step="10"
                className="tsearch"
                style={{ width: '100%', padding: '6px 10px' }}
                value={length}
                onChange={(e) => {
                  setLength(e.target.value)
                  setCustomM2('')
                }}
              />
            </div>
            <div>
              <label className="text-xs muted block mb-1">Direct M² Override</label>
              <input
                type="number"
                placeholder={money(totalM2)}
                className="tsearch"
                style={{ width: '100%', padding: '6px 10px' }}
                value={customM2}
                onChange={(e) => setCustomM2(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <span className="text-xs muted block">Total Calculated Area</span>
              <span className="fw7 text-lg" style={{ color: 'var(--accent)' }}>{money(totalM2)} M²</span>
            </div>
          </div>

          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Material / Ingredient</th>
                  <th className="r">Net Needed</th>
                  <th className="r">Scrap Allowance</th>
                  <th className="r">Total Required (Issue Qty)</th>
                  <th>UOM</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id}>
                    <td>
                      <span className="mat-name">{it.layer_name}</span>
                      <span className="mat-sub">{it.mat?.name || it.mat_code || 'Warehouse Stock'}</span>
                    </td>
                    <td className="num">{qty(it.net)}</td>
                    <td className="num muted">+{qty(it.scrap)}</td>
                    <td className="num fw7" style={{ color: 'var(--ink)' }}>{qty(it.total)}</td>
                    <td><span className="badge b-none">{it.uom}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </RouteDialog>
  )
}
