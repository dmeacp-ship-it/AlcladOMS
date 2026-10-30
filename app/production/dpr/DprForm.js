'use client'
import { useMemo, useRef, useState } from 'react'
import { Combobox } from '../../ui'
import { createProduction } from '../actions'
import ActionForm from '../../inventory/ActionForm'
import FgSpecModal from '../FgSpecModal'
import { calcDprBOM, DEFAULT_CORE_SETTINGS } from '@/lib/bom'

const blankRow = { item: '', plan_item: '', planned: null, good: '', rejected: '', reason: '' }

export default function DprForm({ fg, materials = [], planRows, options = {}, coreSettings = [], children }) {
  // Row keys are also field names, so they start at 1 on the server and in the browser alike.
  const [rows, setRows] = useState(() =>
    (planRows?.length ? planRows : [blankRow]).map((r, i) => ({
      ...blankRow,
      ...r,
      key: i + 1,
      good: r.good ?? '',
      rejected: r.rejected ?? '',
      reason: r.reason ?? '',
    }))
  )
  const [itemsList, setItemsList] = useState(fg)
  const [userEdits, setUserEdits] = useState({}) // { [cKey]: { material_id, actual_qty, reason, edited } }
  const [extraUsage, setExtraUsage] = useState([]) // manual extra materials
  const [specModalOpen, setSpecModalOpen] = useState(false)
  const [specTargetRow, setSpecTargetRow] = useState(null)
  const next = useRef(100)

  const row = () => ({ ...blankRow, key: ++next.current })
  const fgOptions = itemsList.map((f) => ({ value: String(f.id), label: f.code, sub: f.color_name || undefined }))
  const rmOptions = materials.map((m) => ({ value: String(m.id), label: m.name, badge: m.code, sub: m.uom }))

  const updateRow = (key, field, val) => {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, [field]: val } : r)))
  }

  const handleSpecSelect = (item) => {
    setItemsList((prev) => (prev.some((x) => String(x.id) === String(item.id)) ? prev : [item, ...prev]))
    if (specTargetRow) {
      updateRow(specTargetRow, 'item', String(item.id))
    } else {
      const newKey = ++next.current
      setRows((rs) => [...rs, { ...blankRow, key: newKey, item: String(item.id) }])
    }
  }

  // ── Calculate dynamic BOM requirements from produced pieces ──
  const bomRows = useMemo(() => {
    const activeItems = rows
      .map((r) => {
        const itemObj = itemsList.find((f) => String(f.id) === String(r.item))
        const good = Number(r.good) || 0
        const rej = Number(r.rejected) || 0
        if (!itemObj || (good + rej <= 0)) return null
        return { fg_item: itemObj, good_qty: good, rejected_qty: rej }
      })
      .filter(Boolean)

    if (!activeItems.length) return []
    return calcDprBOM(activeItems, coreSettings.length ? coreSettings : DEFAULT_CORE_SETTINGS, materials)
  }, [rows, itemsList, coreSettings, materials])

  // Merge BOM calculations with user overrides
  const consumptionTable = useMemo(() => {
    const base = bomRows.map((bom) => {
      const edit = userEdits[bom.key] || {}
      const material_id = edit.material_id !== undefined ? edit.material_id : (bom.material_id ? String(bom.material_id) : '')
      const actual_qty = edit.actual_qty !== undefined ? edit.actual_qty : bom.system_qty
      const reason = edit.reason !== undefined ? edit.reason : ''
      const sys = Number(bom.system_qty) || 0
      const act = Number(actual_qty) || 0
      const diffQty = Math.round((act - sys) * 10) / 10
      const diffPct = sys > 0 ? Math.round(((act - sys) / sys) * 1000) / 10 : 0
      const isOverThreshold = Math.abs(diffPct) > 5.0

      return {
        ...bom,
        material_id,
        actual_qty,
        reason,
        diffQty,
        diffPct,
        isOverThreshold,
        snapshot: {
          system_qty: sys,
          actual_qty: act,
          diff_pct: diffPct,
          scrap_pct: bom.scrap_pct,
        },
      }
    })

    const extras = extraUsage.map((u) => {
      const edit = userEdits[u.key] || {}
      const material_id = edit.material_id !== undefined ? edit.material_id : u.material_id
      const actual_qty = edit.actual_qty !== undefined ? edit.actual_qty : (u.actual_qty || '')
      const reason = edit.reason !== undefined ? edit.reason : (u.reason || '')
      const act = Number(actual_qty) || 0

      return {
        key: u.key,
        layer_type: 'OTHER',
        layer_name: 'Additional Material (Extra)',
        material_id,
        suggested_mat_id: null,
        material_name: 'Manual Addition',
        system_qty: 0,
        actual_qty,
        uom: 'KG',
        diffQty: act,
        diffPct: 100,
        isOverThreshold: act > 0 && !reason,
        isExtra: true,
      }
    })

    return [...base, ...extras]
  }, [bomRows, userEdits, extraUsage])

  const handleActualChange = (key, val) => {
    setUserEdits((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        actual_qty: val,
        edited: true,
      },
    }))
  }

  const handleMaterialChange = (key, val) => {
    setUserEdits((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        material_id: val,
      },
    }))
  }

  const handleReasonChange = (key, val) => {
    setUserEdits((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        reason: val,
      },
    }))
  }

  const hasMissingReason = consumptionTable.some((c) => c.isOverThreshold && !String(c.reason || '').trim())

  return (
    <>
      <ActionForm action={createProduction} submit={{ label: 'Save production', icon: 'ph-check', disabled: hasMissingReason }}>
        <section className="fsec compact" style={{ padding: '12px 16px', marginBottom: 12 }}>
          {children}
        </section>

        {/* 1. Pieces produced */}
        <div className="card mb-12">
          <div className="tbl-top" style={{ minHeight: 46, padding: '10px 16px' }}>
            <h2 className="tbl-ttl" style={{ fontSize: '0.875rem' }}>
              <i className="ph ph-stack" />
              Pieces produced
              <span className="badge b-none">{rows.length}</span>
            </h2>
            <span className="muted text-sm">Good pieces wait for FG QC · rejected pieces need a reason</span>
          </div>

          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: '42%' }}>Item (product + size)</th>
                  <th className="r" style={{ width: 95 }}>Planned left</th>
                  <th style={{ width: 110 }}>Good pcs</th>
                  <th style={{ width: 110 }}>Rejected pcs</th>
                  <th>Reject reason</th>
                  <th style={{ width: 36 }}><span className="sr-only">Remove</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key}>
                    <td data-label="Item">
                      <input type="hidden" name="row" value={r.key} />
                      <input type="hidden" name={`plan_item_${r.key}`} value={r.plan_item} />
                      {r.plan_item ? (
                        <>
                          <input type="hidden" name={`item_${r.key}`} value={r.item} />
                          <span className="mat-name">{r.label}</span>
                        </>
                      ) : (
                        <div className="d-flex gap-6 ai-c">
                          <Combobox
                            name={`item_${r.key}`}
                            value={r.item}
                            onChange={(v) => updateRow(r.key, 'item', v)}
                            options={fgOptions}
                            placeholder="Search item…"
                            wide
                          />
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            title="Configure panel specification"
                            aria-label="Configure panel specification"
                            style={{ padding: '0 8px', flexShrink: 0, height: 34 }}
                            onClick={() => {
                              setSpecTargetRow(r.key)
                              setSpecModalOpen(true)
                            }}
                          >
                            <i className="ph ph-sliders-horizontal" />
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="num" data-label="Planned left">{r.planned ?? '—'}</td>
                    <td data-label="Good pcs">
                      <input
                        name={`good_${r.key}`}
                        type="number"
                        inputMode="numeric"
                        min={0}
                        step={1}
                        placeholder="0"
                        aria-label="Good pieces"
                        value={r.good}
                        onChange={(e) => updateRow(r.key, 'good', e.target.value)}
                        style={{ textAlign: 'right' }}
                      />
                    </td>
                    <td data-label="Rejected pcs">
                      <input
                        name={`rejected_${r.key}`}
                        type="number"
                        inputMode="numeric"
                        min={0}
                        step={1}
                        placeholder="0"
                        aria-label="Rejected pieces"
                        value={r.rejected}
                        onChange={(e) => updateRow(r.key, 'rejected', e.target.value)}
                        style={{ textAlign: 'right' }}
                      />
                    </td>
                    <td data-label="Reject reason">
                      <input
                        name={`reason_${r.key}`}
                        placeholder="Dent, coating, delamination…"
                        aria-label="Reject reason"
                        value={r.reason}
                        onChange={(e) => updateRow(r.key, 'reason', e.target.value)}
                      />
                    </td>
                    <td data-label="">
                      <button
                        type="button"
                        className="btn-link danger"
                        disabled={rows.length === 1}
                        aria-label="Remove row"
                        onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                      >
                        <i className="ph ph-trash" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="tbl-actions-bar" style={{ padding: '8px 16px' }}>
            <div className="tbl-actions-left">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRows((rs) => [...rs, row()])}>
                <i className="ph ph-plus" /> Add item
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setSpecTargetRow(null)
                  setSpecModalOpen(true)
                }}
              >
                <i className="ph ph-sliders-horizontal" /> Custom size / product
              </button>
            </div>
          </div>
        </div>

        {/* 2. Material used (Auto-calculated BOM + editable Actuals) */}
        <div className="card mb-16">
          <div className="tbl-top" style={{ minHeight: 46, padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 className="tbl-ttl" style={{ fontSize: '0.875rem' }}>
                <i className="ph ph-package" />
                Raw Material Used (BOM & Actual Consumption)
                <span className="badge b-none">{consumptionTable.length}</span>
              </h2>
              <span className="muted text-sm">
                System (BOM) calculated from good + rejected pieces · Difference &gt; 5% requires a reason
              </span>
            </div>
            {hasMissingReason && (
              <span className="badge b-danger fw6">
                <i className="ph ph-warning-circle" /> Difference &gt; 5% requires a reason
              </span>
            )}
          </div>

          {bomRows.missingCores?.length > 0 && (
            <div className="banner error" role="alert" style={{ margin: '0 16px 12px' }}>
              <i className="ph ph-warning-circle" />
              <span>No BOM settings for core type {bomRows.missingCores.join(', ')}: its material can't be worked out. Add it under Settings → BOM &amp; Recipes before saving.</span>
            </div>
          )}
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: '34%' }}>Material</th>
                  <th className="r" style={{ width: 120 }}>System (BOM)</th>
                  <th style={{ width: 130 }}>Actual used</th>
                  <th className="r" style={{ width: 110 }}>Difference</th>
                  <th>Reason (if different)</th>
                  <th style={{ width: 36 }}><span className="sr-only">Action</span></th>
                </tr>
              </thead>
              <tbody>
                {consumptionTable.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '24px 16px' }} className="muted">
                      <i className="ph ph-calculator" style={{ fontSize: '1.25rem', marginBottom: 4, display: 'block' }} />
                      Enter good or rejected pieces above to calculate raw material consumption.
                    </td>
                  </tr>
                ) : (
                  consumptionTable.map((c, idx) => {
                    const k = c.key
                    const rowClass = c.isOverThreshold ? 'variance-alert' : ''
                    const diffText = c.system_qty > 0
                      ? `${c.diffPct > 0 ? '+' : ''}${c.diffPct.toFixed(1)}%`
                      : (c.actual_qty > 0 ? '+100%' : '0%')

                    return (
                      <tr
                        key={k}
                        className={rowClass}
                        style={c.isOverThreshold ? { background: 'rgba(239, 68, 68, 0.06)' } : undefined}
                      >
                        <td data-label="Material">
                          <input type="hidden" name="consumption_row" value={k} />
                          <input type="hidden" name={`c_layer_${k}`} value={c.layer_type} />
                          <input type="hidden" name={`c_suggested_${k}`} value={c.suggested_mat_id || ''} />
                          <input type="hidden" name={`c_system_${k}`} value={c.system_qty} />
                          <input type="hidden" name={`c_uom_${k}`} value={c.uom} />
                          <input type="hidden" name={`c_snapshot_${k}`} value={JSON.stringify(c.snapshot || {})} />

                          <div className="d-flex f-col gap-2">
                            <div className="d-flex ai-c gap-6">
                              <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{c.layer_name}</span>
                              {c.is_coil && <span className="badge b-info" style={{ fontSize: '0.75rem' }}>Coil</span>}
                            </div>
                            <div className="w-full mt-4">
                              <Combobox
                                name={`c_material_${k}`}
                                value={c.material_id}
                                options={rmOptions}
                                placeholder="Choose material..."
                                wide
                                onChange={(v) => handleMaterialChange(k, v)}
                              />
                            </div>
                          </div>
                        </td>

                        <td className="num va-m" data-label="System (BOM)">
                          <span className="fw6">{c.system_qty.toLocaleString()}</span>{' '}
                          <span className="muted text-xs">{c.uom}</span>
                        </td>

                        <td className="va-m" data-label="Actual used">
                          <div className="d-flex ai-c gap-4">
                            <input
                              name={`c_actual_${k}`}
                              type="number"
                              inputMode="decimal"
                              min={0}
                              step="any"
                              value={c.actual_qty}
                              onChange={(e) => handleActualChange(k, e.target.value)}
                              aria-label="Actual quantity used"
                              style={{
                                textAlign: 'right',
                                fontWeight: 600,
                                borderColor: c.isOverThreshold ? 'var(--red)' : undefined,
                              }}
                            />
                            <span className="muted text-xs" style={{ width: 24 }}>{c.uom}</span>
                          </div>
                        </td>

                        <td className="num va-m" data-label="Difference">
                          <span
                            className={`badge ${
                              c.isOverThreshold
                                ? 'b-danger'
                                : Math.abs(c.diffPct) > 0.05
                                ? 'b-warn'
                                : 'b-none'
                            }`}
                            style={{ fontWeight: 600 }}
                          >
                            {diffText}
                          </span>
                          <div className="muted text-xs mt-2">
                            {c.diffQty > 0 ? `+${c.diffQty}` : c.diffQty} {c.uom}
                          </div>
                        </td>

                        <td className="va-m" data-label="Reason">
                          <input
                            name={`c_reason_${k}`}
                            value={c.reason}
                            placeholder={c.isOverThreshold ? 'Required: over 5% variance…' : 'Optional notes…'}
                            aria-label="Reason for variance"
                            onChange={(e) => handleReasonChange(k, e.target.value)}
                            required={c.isOverThreshold}
                            style={{
                              borderColor: c.isOverThreshold && !c.reason ? 'var(--red)' : undefined,
                              background: c.isOverThreshold && !c.reason ? 'rgba(239, 68, 68, 0.04)' : undefined,
                            }}
                          />
                        </td>

                        <td className="va-m" data-label="">
                          {c.isExtra && (
                            <button
                              type="button"
                              className="btn-link danger"
                              aria-label="Remove extra material"
                              onClick={() => {
                                setExtraUsage((prev) => prev.filter((x) => x.key !== k))
                                setUserEdits((prev) => {
                                  const n = { ...prev }
                                  delete n[k]
                                  return n
                                })
                              }}
                            >
                              <i className="ph ph-trash" />
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="tbl-actions-bar" style={{ padding: '8px 16px' }}>
            <div className="tbl-actions-left">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  const key = `extra-${++next.current}`
                  setExtraUsage((prev) => [...prev, { key, material_id: '', actual_qty: '', reason: '' }])
                }}
              >
                <i className="ph ph-plus" /> Add extra material (chemicals, tape, packaging)
              </button>
            </div>
          </div>
        </div>
      </ActionForm>

      <FgSpecModal
        open={specModalOpen}
        onClose={() => setSpecModalOpen(false)}
        onSelect={handleSpecSelect}
        options={options}
      />
    </>
  )
}
