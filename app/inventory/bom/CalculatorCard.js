'use client'

import { useState } from 'react'
import Link from 'next/link'
import { money, qty } from '@/lib/tas'

export default function CalculatorCard({ boms }) {
  const [selectedBomId, setSelectedBomId] = useState(boms[0]?.id || '')
  const [pcs, setPcs] = useState(1000)
  const [width, setWidth] = useState(1250)
  const [length, setLength] = useState(2440)
  const [customM2, setCustomM2] = useState('')

  const activeBom = boms.find((b) => String(b.id) === String(selectedBomId)) || boms[0]

  // Calculations
  const sheetM2 = (Number(width) * Number(length)) / 1000000
  const totalM2 = customM2 !== '' && !Number.isNaN(Number(customM2))
    ? Number(customM2)
    : Math.round(Number(pcs || 0) * sheetM2 * 100) / 100

  const items = (activeBom?.items || []).map((it) => {
    const rate = Number(it.qty_per_m2 || 0)
    const scrapPct = Number(it.scrap_pct || 0)
    const net = totalM2 * rate
    const scrap = net * (scrapPct / 100)
    const total = net + scrap
    const rateWithScrap = rate * (1 + scrapPct / 100)

    return {
      ...it,
      rateWithScrap,
      net: Math.round(net * 100) / 100,
      scrap: Math.round(scrap * 100) / 100,
      total: Math.round(total * 100) / 100,
    }
  })

  const totalKg = items
    .filter((i) => i.uom === 'KG')
    .reduce((sum, i) => sum + i.total, 0)

  const issueParams = new URLSearchParams()
  issueParams.set('notes', `BOM Requisition: ${activeBom?.name || 'ACP Batch'} (${money(totalM2)} M2)`)

  return (
    <div style={{ padding: '20px 24px' }}>
      {/* ── Configuration Row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 20 }}>
        <div>
          <label className="text-xs muted block mb-1">Select BOM Recipe Template</label>
          <select
            className="tsearch"
            style={{ width: '100%', padding: '8px 12px', background: 'var(--surface-sunken)', fontWeight: 600 }}
            value={selectedBomId}
            onChange={(e) => setSelectedBomId(e.target.value)}
          >
            {boms.map((b) => (
              <option key={b.id} value={b.id}>
                {b.code} — {b.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs muted block mb-1">Production Sheets (Pcs)</label>
          <input
            type="number"
            min="1"
            className="tsearch"
            style={{ width: '100%', padding: '8px 12px' }}
            value={pcs}
            onChange={(e) => {
              setPcs(e.target.value)
              setCustomM2('')
            }}
          />
        </div>

        <div>
          <label className="text-xs muted block mb-1">Sheet Width (mm)</label>
          <input
            type="number"
            min="500"
            step="10"
            className="tsearch"
            style={{ width: '100%', padding: '8px 12px' }}
            value={width}
            onChange={(e) => {
              setWidth(e.target.value)
              setCustomM2('')
            }}
          />
        </div>

        <div>
          <label className="text-xs muted block mb-1">Sheet Length (mm)</label>
          <input
            type="number"
            min="500"
            step="10"
            className="tsearch"
            style={{ width: '100%', padding: '8px 12px' }}
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
            style={{ width: '100%', padding: '8px 12px' }}
            value={customM2}
            onChange={(e) => setCustomM2(e.target.value)}
          />
        </div>
      </div>

      {/* ── Summary Metrics Bar ── */}
      <div
        style={{
          background: 'var(--surface-sunken)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '16px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 16,
          marginBottom: 20,
        }}
      >
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <div>
            <span className="muted text-xs block">Target Total Area</span>
            <span className="fw7 text-xl" style={{ color: 'var(--accent)' }}>
              {money(totalM2)} M²
            </span>
          </div>
          <div>
            <span className="muted text-xs block">Sheet Size</span>
            <span className="fw6 text-base">{width} × {length} mm</span>
            <span className="muted text-xs"> ({money(sheetM2)} m²/pc)</span>
          </div>
          <div>
            <span className="muted text-xs block">Recipe Specification</span>
            <span className="fw6 text-base">{activeBom?.thickness}mm {activeBom?.grade}</span>
            <span className="muted text-xs"> (Top {activeBom?.top_skin} / Bot {activeBom?.bottom_skin})</span>
          </div>
          <div>
            <span className="muted text-xs block">Total Batch RM Weight</span>
            <span className="fw7 text-xl">{qty(totalKg)} KG</span>
          </div>
        </div>

        <div>
          <Link
            href={`/inventory/issue/new?${issueParams.toString()}`}
            className="btn btn-primary"
          >
            <i className="ph ph-arrows-left-right" />
            Issue to Production Line
          </Link>
        </div>
      </div>

      {/* ── Breakdown Table ── */}
      <div className="tbl-wrap" style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Layer &amp; Material</th>
              <th>Category</th>
              <th className="r">Formula Consumption Rate</th>
              <th className="r">Net Material Needed</th>
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
                  <span className="mat-sub">{it.mat?.name || it.mat_code || 'Stock Material'}</span>
                </td>
                <td>
                  <span className={`badge ${it.category === 'RM' ? 'b-blue' : it.category === 'GRANULE' ? 'b-teal' : 'b-gray'}`}>
                    {it.category}
                  </span>
                </td>
                <td className="num font-mono text-xs">
                  {money(it.qty_per_m2)} {it.uom}/m²
                </td>
                <td className="num">{qty(it.net)}</td>
                <td className="num muted">+{it.scrap_pct}% ({qty(it.scrap)})</td>
                <td className="num fw7" style={{ color: 'var(--ink)' }}>
                  {qty(it.total)}
                </td>
                <td>
                  <span className="badge b-none">{it.uom}</span>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th colSpan={3} className="fw7">Total Batch Materials</th>
              <th className="num fw7">{qty(items.filter((i) => i.uom === 'KG').reduce((s, i) => s + i.net, 0))}</th>
              <th className="num muted">+{qty(items.filter((i) => i.uom === 'KG').reduce((s, i) => s + i.scrap, 0))}</th>
              <th className="num fw7" style={{ color: 'var(--accent)', fontSize: '1.05rem' }}>
                {qty(totalKg)} KG
              </th>
              <th></th>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
