'use client'
import { useRef, useState } from 'react'
import { Combobox } from '../../ui'
import { createProduction } from '../actions'
import ActionForm from '../../inventory/ActionForm'
import FgSpecModal from '../FgSpecModal'

const blank = { item: '', plan_item: '', planned: null }

// Production entry: header (children), FG rows (from the plan, or picked) and the RM used on the line.
// fg / materials: picker lists; planRows: [{ item, plan_item, planned, label }] when entered against a plan.
export default function DprForm({ fg, materials, planRows, options = {}, children }) {
  // Row keys are also field names, so they start at 1 on the server and in the browser alike.
  const [rows, setRows] = useState(() => (planRows?.length ? planRows : [blank]).map((r, i) => ({ ...blank, ...r, key: i + 1 })))
  const [itemsList, setItemsList] = useState(fg)
  const [usage, setUsage] = useState([{ key: 1, material: '' }])
  const [specModalOpen, setSpecModalOpen] = useState(false)
  const [specTargetRow, setSpecTargetRow] = useState(null)
  const next = useRef(100)

  const row = () => ({ ...blank, key: ++next.current })
  const fgOptions = itemsList.map((f) => ({ value: String(f.id), label: f.code, sub: f.color_name || undefined }))
  const rmOptions = materials.map((m) => ({ value: String(m.id), label: m.name, badge: m.code, sub: m.uom }))
  const set = (k, v) => setRows((rs) => rs.map((r) => (r.key === k ? { ...r, item: v } : r)))

  const handleSpecSelect = (item) => {
    setItemsList((prev) => (prev.some((x) => String(x.id) === String(item.id)) ? prev : [item, ...prev]))
    if (specTargetRow) {
      set(specTargetRow, String(item.id))
    } else {
      const newKey = ++next.current
      setRows((rs) => [...rs, { ...blank, key: newKey, item: String(item.id) }])
    }
  }

  return (
    <>
      <ActionForm action={createProduction} submit={{ label: 'Save production', icon: 'ph-check' }}>
        <section className="fsec compact" style={{ padding: '12px 16px', marginBottom: 12 }}>
          {children}
        </section>

        {/* 1. Pieces produced */}
        <div className="card" style={{ marginBottom: 12 }}>
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
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <Combobox
                            name={`item_${r.key}`}
                            value={r.item}
                            onChange={(v) => set(r.key, v)}
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
                        style={{ textAlign: 'right' }}
                      />
                    </td>
                    <td data-label="Reject reason">
                      <input
                        name={`reason_${r.key}`}
                        placeholder="Dent, coating, delamination…"
                        aria-label="Reject reason"
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

        {/* 2. RM used on the line */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="tbl-top" style={{ minHeight: 46, padding: '10px 16px' }}>
            <h2 className="tbl-ttl" style={{ fontSize: '0.875rem' }}>
              <i className="ph ph-package" />
              RM used on the line
              <span className="badge b-none">{usage.filter((u) => u.material).length}</span>
            </h2>
            <span className="muted text-sm">Deducted from line store · leave empty if not counted this shift</span>
          </div>

          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: '60%' }}>Material (coils, core, chemicals)</th>
                  <th style={{ width: 140 }}>Qty used</th>
                  <th style={{ width: 36 }}><span className="sr-only">Remove</span></th>
                </tr>
              </thead>
              <tbody>
                {usage.map((u) => (
                  <tr key={u.key}>
                    <td data-label="Material">
                      <Combobox
                        name="material"
                        value={u.material}
                        options={rmOptions}
                        placeholder="Search code or name…"
                        wide
                        onChange={(v) => setUsage((us) => us.map((x) => (x.key === u.key ? { ...x, material: v } : x)))}
                      />
                    </td>
                    <td data-label="Qty used">
                      <input
                        name="qty"
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="any"
                        placeholder="0.00"
                        aria-label="Quantity used"
                        style={{ textAlign: 'right' }}
                      />
                    </td>
                    <td data-label="">
                      <button
                        type="button"
                        className="btn-link danger"
                        aria-label="Remove material"
                        onClick={() => setUsage((us) => us.filter((x) => x.key !== u.key))}
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
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setUsage((us) => [...us, { key: ++next.current, material: '' }])}>
                <i className="ph ph-plus" /> Add material
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
