'use client'

import { useState } from 'react'
import { calcPanelBOM, DEFAULT_CORE_SETTINGS } from '@/lib/bom'
import { qty } from '@/lib/tas'

export default function CalculatorCard({ coreSettings = [] }) {
  const [coreType, setCoreType] = useState('NFR')
  const [thickness, setThickness] = useState(4.0)
  const [topSkin, setTopSkin] = useState(0.25)
  const [botSkin, setBotSkin] = useState(0.20)
  const [width, setWidth] = useState(1250)
  const [length, setLength] = useState(2440)
  const [pieces, setPieces] = useState(1000)

  const settingsMap = coreSettings.length
    ? Object.fromEntries(coreSettings.map((s) => [s.core_type, s]))
    : DEFAULT_CORE_SETTINGS

  const bom = calcPanelBOM(
    {
      core: coreType,
      thickness,
      skin: topSkin,
      bottom_skin: botSkin,
      width,
      length,
    },
    pieces,
    settingsMap
  )

  const totalKg = bom.layers
    .filter((l) => l.uom === 'KG')
    .reduce((sum, l) => sum + l.qty, 0)
  const kgPerM2 = bom.totalM2 > 0 ? totalKg / bom.totalM2 : 0

  return (
    <div style={{ padding: '20px 24px' }}>
      {/* ── Inputs Grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 20 }}>
        <div>
          <label className="text-xs muted block mb-1">Core Type</label>
          <select
            className="tsearch"
            style={{ width: '100%', padding: '8px 10px', fontWeight: 600 }}
            value={coreType}
            onChange={(e) => setCoreType(e.target.value)}
          >
            {coreSettings.map((s) => (
              <option key={s.core_type} value={s.core_type}>
                {s.core_type} — {s.name} ({s.density} g/cm³)
              </option>
            ))}
            {!coreSettings.some((s) => s.core_type === 'NFR') && <option value="NFR">NFR (0.92 g/cm³)</option>}
            {!coreSettings.some((s) => s.core_type === 'FRB1') && <option value="FRB1">FR-B1 (1.60 g/cm³)</option>}
            {!coreSettings.some((s) => s.core_type === 'FRA2') && <option value="FRA2">FR-A2 (1.90 g/cm³)</option>}
          </select>
        </div>

        <div>
          <label className="text-xs muted block mb-1">Total Panel Thk (mm)</label>
          <input
            type="number"
            step="0.1"
            min="1"
            max="10"
            className="tsearch"
            style={{ width: '100%', padding: '8px 10px' }}
            value={thickness}
            onChange={(e) => setThickness(Number(e.target.value))}
          />
        </div>

        <div>
          <label className="text-xs muted block mb-1">Top Skin (mm)</label>
          <input
            type="number"
            step="0.01"
            min="0.1"
            max="1"
            className="tsearch"
            style={{ width: '100%', padding: '8px 10px' }}
            value={topSkin}
            onChange={(e) => setTopSkin(Number(e.target.value))}
          />
        </div>

        <div>
          <label className="text-xs muted block mb-1">Bottom Skin (mm)</label>
          <input
            type="number"
            step="0.01"
            min="0.1"
            max="1"
            className="tsearch"
            style={{ width: '100%', padding: '8px 10px' }}
            value={botSkin}
            onChange={(e) => setBotSkin(Number(e.target.value))}
          />
        </div>

        <div>
          <label className="text-xs muted block mb-1">Width (mm)</label>
          <input
            type="number"
            step="10"
            min="500"
            max="2000"
            className="tsearch"
            style={{ width: '100%', padding: '8px 10px' }}
            value={width}
            onChange={(e) => setWidth(Number(e.target.value))}
          />
        </div>

        <div>
          <label className="text-xs muted block mb-1">Length (mm)</label>
          <input
            type="number"
            step="10"
            min="500"
            max="8000"
            className="tsearch"
            style={{ width: '100%', padding: '8px 10px' }}
            value={length}
            onChange={(e) => setLength(Number(e.target.value))}
          />
        </div>

        <div>
          <label className="text-xs muted block mb-1">Quantity (Pieces)</label>
          <input
            type="number"
            min="1"
            step="1"
            className="tsearch"
            style={{ width: '100%', padding: '8px 10px', fontWeight: 600 }}
            value={pieces}
            onChange={(e) => setPieces(Number(e.target.value))}
          />
        </div>
      </div>

      {/* ── Summary KPI Strip ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, marginBottom: 20 }}>
        <div className="card" style={{ padding: '12px 14px', background: 'var(--fill-2)' }}>
          <div className="muted text-xs">Total Surface Area</div>
          <div className="fw7 font-mono" style={{ fontSize: '1.125rem', marginTop: 4 }}>
            {qty(bom.totalM2)} <span className="text-xs muted">m²</span>
          </div>
        </div>

        <div className="card" style={{ padding: '12px 14px', background: 'var(--fill-2)' }}>
          <div className="muted text-xs">Net Core Thickness</div>
          <div className="fw7 font-mono" style={{ fontSize: '1.125rem', marginTop: 4 }}>
            {bom.coreThickness.toFixed(2)} <span className="text-xs muted">mm</span>
          </div>
        </div>

        <div className="card" style={{ padding: '12px 14px', background: 'var(--fill-2)' }}>
          <div className="muted text-xs">Total Raw Material</div>
          <div className="fw7 font-mono" style={{ fontSize: '1.125rem', marginTop: 4 }}>
            {qty(totalKg)} <span className="text-xs muted">kg</span>
          </div>
        </div>

        <div className="card" style={{ padding: '12px 14px', background: 'var(--fill-2)' }}>
          <div className="muted text-xs">Panel Weight</div>
          <div className="fw7 font-mono" style={{ fontSize: '1.125rem', marginTop: 4 }}>
            {kgPerM2.toFixed(2)} <span className="text-xs muted">kg/m²</span>
          </div>
        </div>
      </div>

      {/* ── Layer Breakdown Table ── */}
      <div className="tbl-wrap" style={{ borderRadius: 8, border: '1px solid var(--border)' }}>
        <table className="tbl m-0">
          <thead>
            <tr>
              <th>Layer / Component</th>
              <th>Material Spec</th>
              <th className="r">Rate per m²</th>
              <th className="r">Scrap Factor</th>
              <th className="r">Required Quantity</th>
              <th style={{ width: 60 }}>UoM</th>
            </tr>
          </thead>
          <tbody>
            {bom.layers.map((l) => (
              <tr key={l.key}>
                <td className="fw6">
                  {l.name}
                  {l.is_blend && (
                    <span className="badge b-info text-xs ml-6">
                      {l.blend_ratio_pct}% blend
                    </span>
                  )}
                </td>
                <td className="muted text-sm">{l.spec || '—'}</td>
                <td className="num">{l.rate_per_m2 ? l.rate_per_m2.toFixed(3) : '—'}</td>
                <td className="num">{l.scrap_factor > 1 ? `+${Math.round((l.scrap_factor - 1) * 100)}%` : '—'}</td>
                <td className="num fw7 font-mono" style={{ fontSize: '0.9375rem' }}>
                  {qty(l.qty)}
                </td>
                <td className="muted text-xs fw6">{l.uom}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
