'use client'

import { useState } from 'react'
import { RouteDialog } from '../../ui'
import ActionForm from '@/app/inventory/ActionForm'
import { updateCoreSettingsAction } from '@/app/inventory/actions'

export default function BomDialog({ setting, materials = [], closeHref = '/admin/bom' }) {
  if (!setting) return null

  const coreMats = materials.filter((m) => m.kind === 'CORE' || m.category === 'GRANULE' || m.name?.toLowerCase().includes('granule') || m.name?.toLowerCase().includes('core'))
  const blendMats = materials.filter((m) => m.kind === 'CORE' || m.kind === 'OTHER' || m.category === 'GRANULE' || m.category === 'RM' || m.name?.toLowerCase().includes('calcium') || m.name?.toLowerCase().includes('desiccant'))
  const adhMats = materials.filter((m) => m.kind === 'ADHESIVE' || m.name?.toLowerCase().includes('adhesive'))
  const maskMats = materials.filter((m) => m.kind === 'MASKING' || m.name?.toLowerCase().includes('protective') || m.name?.toLowerCase().includes('masking'))

  const [blendEnabled, setBlendEnabled] = useState(Boolean(setting.blend_enabled))
  const [blendComponents, setBlendComponents] = useState(() => {
    if (Array.isArray(setting.blend_components) && setting.blend_components.length > 0) {
      return setting.blend_components
    }
    // Default 70/25/5 formulation for NFR
    const ldpe = materials.find((m) => m.code?.includes('LDPE') || m.name?.includes('LDPE'))
    const caco3 = materials.find((m) => m.name?.includes('CALCIUM') || m.code?.includes('CaCO3') || m.name?.includes('CaCO3'))
    const des = materials.find((m) => m.name?.includes('DESICCANT') || m.code?.includes('DESICCANT'))
    return [
      { material_id: ldpe?.id || '', name: ldpe?.name || 'LDPE Recycled Granule (A)', ratio_pct: 70 },
      { material_id: caco3?.id || '', name: caco3?.name || 'Calcium Compound Filler (CaCO3)', ratio_pct: 25 },
      { material_id: des?.id || '', name: des?.name || 'Desiccant Masterbatch', ratio_pct: 5 },
    ]
  })

  const totalPct = blendComponents.reduce((sum, c) => sum + (Number(c.ratio_pct) || 0), 0)

  const handleComponentChange = (index, field, value) => {
    setBlendComponents((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], [field]: value }
      if (field === 'material_id') {
        const mat = materials.find((m) => String(m.id) === String(value))
        if (mat) next[index].name = mat.name
      }
      return next
    })
  }

  const addComponent = () => {
    setBlendComponents((prev) => [
      ...prev,
      { material_id: '', name: '', ratio_pct: 10 },
    ])
  }

  const removeComponent = (index) => {
    setBlendComponents((prev) => prev.filter((_, i) => i !== index))
  }

  const applyNfrPreset = () => {
    const ldpe = materials.find((m) => m.code?.includes('LDPE') || m.name?.includes('LDPE'))
    const caco3 = materials.find((m) => m.name?.includes('CALCIUM') || m.code?.includes('CaCO3') || m.name?.includes('CaCO3'))
    const des = materials.find((m) => m.name?.includes('DESICCANT') || m.code?.includes('DESICCANT'))
    setBlendComponents([
      { material_id: ldpe?.id || '', name: ldpe?.name || 'LDPE Recycled Granule (A)', ratio_pct: 70 },
      { material_id: caco3?.id || '', name: caco3?.name || 'Calcium Compound Filler (CaCO3)', ratio_pct: 25 },
      { material_id: des?.id || '', name: des?.name || 'Desiccant Masterbatch', ratio_pct: 5 },
    ])
  }

  return (
    <RouteDialog
      icon="ph-sliders"
      title={<>Edit Core Setting: {setting.name || setting.core_type}</>}
      closeHref={closeHref}
    >
      <ActionForm action={updateCoreSettingsAction} submit={{ label: 'Save Core Settings', icon: 'ph-check' }}>
        <input type="hidden" name="core_type" value={setting.core_type} />
        <input type="hidden" name="back" value="/admin/bom" />
        <input type="hidden" name="blend_components_json" value={JSON.stringify(blendComponents)} />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
          <div className="fg">
            <label>Core Type Code</label>
            <input value={setting.core_type} disabled className="fw6" style={{ background: 'var(--fill-2)' }} />
          </div>

          <div className="fg">
            <label htmlFor="name">Display Name <span className="req">*</span></label>
            <input id="name" name="name" defaultValue={setting.name || ''} required />
          </div>

          <div className="fg">
            <label htmlFor="density">Core Density (g/cm³ or kg/m² per mm) <span className="req">*</span></label>
            <input
              id="density"
              name="density"
              type="number"
              step="0.01"
              min="0.5"
              max="3.0"
              defaultValue={setting.density || 0.92}
              required
            />
            <span className="muted text-xs">Standard: 0.92 (PE), 1.60 (FR-B1), 1.90 (FR-A2)</span>
          </div>

          <div className="fg">
            <label htmlFor="scrap_pct">Scrap / Trim Allowance (%) <span className="req">*</span></label>
            <input
              id="scrap_pct"
              name="scrap_pct"
              type="number"
              step="0.5"
              min="0"
              max="20"
              defaultValue={setting.scrap_pct ?? 3.0}
              required
            />
            <span className="muted text-xs">Factory scrap factor (typically 3%)</span>
          </div>

          <div className="fg">
            <label htmlFor="bottom_skin_mode">Bottom Skin Rule</label>
            <select
              id="bottom_skin_mode"
              name="bottom_skin_mode"
              className="tsearch"
              defaultValue={setting.bottom_skin_mode || 'SAME_AS_TOP'}
              style={{ width: '100%', padding: '8px 10px' }}
            >
              <option value="SAME_AS_TOP">Same as Top Skin (Standard for TAS)</option>
              <option value="STANDARD_020">Fixed 0.20mm Service Coat</option>
            </select>
          </div>

          <div className="fg">
            <label htmlFor="uom">Unit of Measure (UoM)</label>
            <select
              id="uom"
              name="uom"
              className="tsearch"
              defaultValue={setting.uom || 'KG'}
              style={{ width: '100%', padding: '8px 10px' }}
            >
              <option value="KG">Kilograms (KG) — Extruded Granules</option>
              <option value="M2">Square Meters (M²) — Solid Core Boards</option>
            </select>
          </div>
        </div>

        {/* ── Multi-Component Core Formulation (Blend Option) ── */}
        <div
          className="card"
          style={{
            padding: '14px 16px',
            marginBottom: 16,
            background: blendEnabled ? 'color-mix(in srgb, var(--part) 6%, transparent)' : 'var(--fill-2)',
            border: blendEnabled ? '1px solid var(--border)' : undefined,
          }}
        >
          <div className="d-flex ai-c jc-sb mb-6">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem' }}>
              <input
                type="checkbox"
                name="blend_enabled"
                checked={blendEnabled}
                onChange={(e) => setBlendEnabled(e.target.checked)}
                style={{ width: 17, height: 17 }}
              />
              <span>Enable Multi-Component Core Blend ({setting.core_type})</span>
            </label>
            {blendEnabled && (
              <span className={`badge ${Math.abs(totalPct - 100) < 0.5 ? 'b-ok' : 'b-danger'}`} style={{ fontWeight: 600 }}>
                Total: {totalPct}% {Math.abs(totalPct - 100) < 0.5 ? '✓ 100%' : '⚠ Must be 100%'}
              </span>
            )}
          </div>

          <p className="muted text-xs" style={{ margin: '0 0 12px' }}>
            Formulate the core from a mix of raw materials with % ratios (e.g. 70% LDPE + 25% Calcium Filler + 5% Desiccant).
            When enabled, DPR reports calculate and deduct each component separately from line store.
          </p>

          {blendEnabled && (
            <div className="mt-10">
              <div className="d-flex jc-e gap-8 mb-8">
                {setting.core_type === 'NFR' && (
                  <button type="button" onClick={applyNfrPreset} className="btn-link text-xs">
                    <i className="ph ph-arrow-counter-clockwise" /> Reset to 70/25/5 Standard PE Blend
                  </button>
                )}
              </div>

              <div className="tbl-wrap" style={{ background: 'var(--surface)', borderRadius: 6, border: '1px solid var(--border)' }}>
                <table className="tbl m-0">
                  <thead>
                    <tr>
                      <th>Raw Material Component</th>
                      <th className="r" style={{ width: 120 }}>Ratio %</th>
                      <th style={{ width: 44 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {blendComponents.map((comp, idx) => (
                      <tr key={idx}>
                        <td>
                          <select
                            className="tsearch"
                            value={comp.material_id ? String(comp.material_id) : ''}
                            onChange={(e) => handleComponentChange(idx, 'material_id', e.target.value)}
                            style={{ width: '100%', padding: '6px 8px', fontSize: '0.875rem' }}
                            required
                          >
                            <option value="">-- Choose Raw Material --</option>
                            {blendMats.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.code} · {m.name} ({m.uom})
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="num">
                          <div className="d-flex ai-c jc-e gap-4">
                            <input
                              type="number"
                              min="1"
                              max="100"
                              step="1"
                              value={comp.ratio_pct}
                              onChange={(e) => handleComponentChange(idx, 'ratio_pct', Number(e.target.value))}
                              style={{ width: 70, textAlign: 'right', fontWeight: 600, padding: '4px 6px' }}
                              required
                            />
                            <span className="muted text-xs">%</span>
                          </div>
                        </td>
                        <td className="tc">
                          <button
                            type="button"
                            onClick={() => removeComponent(idx)}
                            className="btn-link danger"
                            title="Remove component"
                            style={{ padding: 4 }}
                          >
                            <i className="ph ph-trash" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-8">
                <button type="button" onClick={addComponent} className="btn btn-ghost btn-sm">
                  <i className="ph ph-plus" /> Add Raw Material Component
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Standard Raw Materials (Adhesive, Masking & Single Core fallback) ── */}
        <div className="card" style={{ padding: '14px 16px', marginBottom: 16, background: 'var(--fill-2)' }}>
          <h3 style={{ fontSize: '0.875rem', margin: '0 0 12px', fontWeight: 600 }}>
            <i className="ph ph-link" /> {!blendEnabled ? 'Linked Raw Materials in Store' : 'Adhesive & Protective Masking Materials'}
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
            {!blendEnabled && (
              <div className="fg">
                <label htmlFor="core_material_id">Default Core Material (Granules / Core Sheet)</label>
                <select
                  id="core_material_id"
                  name="core_material_id"
                  className="tsearch"
                  defaultValue={setting.core_material_id ? String(setting.core_material_id) : ''}
                  style={{ width: '100%', padding: '8px 10px' }}
                >
                  <option value="">-- Choose Stock Material --</option>
                  {coreMats.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.code} · {m.name} ({m.uom})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="fg">
              <label htmlFor="adh_material_id">Default Adhesive Film</label>
              <select
                id="adh_material_id"
                name="adh_material_id"
                className="tsearch"
                defaultValue={setting.adh_material_id ? String(setting.adh_material_id) : ''}
                style={{ width: '100%', padding: '8px 10px' }}
              >
                <option value="">-- Choose Stock Material --</option>
                {adhMats.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.code} · {m.name} ({m.uom})
                  </option>
                ))}
              </select>
            </div>

            <div className="fg">
              <label htmlFor="mask_material_id">Default Protective / Masking Film</label>
              <select
                id="mask_material_id"
                name="mask_material_id"
                className="tsearch"
                defaultValue={setting.mask_material_id ? String(setting.mask_material_id) : ''}
                style={{ width: '100%', padding: '8px 10px' }}
              >
                <option value="">-- Choose Stock Material --</option>
                {maskMats.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.code} · {m.name} ({m.uom})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </ActionForm>
    </RouteDialog>
  )
}
