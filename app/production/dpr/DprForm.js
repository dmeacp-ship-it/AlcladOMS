'use client'
import { useRef, useState } from 'react'
import { Combobox } from '../../ui'
import { createProduction } from '../actions'
import ActionForm from '../../inventory/ActionForm'

const blank = { item: '', plan_item: '', planned: null }

// Production entry: header (children), FG rows (from the plan, or picked) and the RM used on the line.
// fg / materials: picker lists; planRows: [{ item, plan_item, planned, label }] when entered against a plan.
export default function DprForm({ fg, materials, planRows, children }) {
  // Row keys are also field names, so they start at 1 on the server and in the browser alike.
  const [rows, setRows] = useState(() => (planRows?.length ? planRows : [blank]).map((r, i) => ({ ...blank, ...r, key: i + 1 })))
  const [usage, setUsage] = useState([{ key: 1, material: '' }])
  const next = useRef(100)
  const row = () => ({ ...blank, key: ++next.current })
  const fgOptions = fg.map((f) => ({ value: String(f.id), label: f.code, sub: f.color_name || undefined }))
  const rmOptions = materials.map((m) => ({ value: String(m.id), label: m.name, badge: m.code, sub: m.uom }))
  const set = (k, v) => setRows((rs) => rs.map((r) => (r.key === k ? { ...r, item: v } : r)))

  return (
    <ActionForm action={createProduction} submit={{ label: 'Save production', icon: 'ph-check' }}>
      <section className="fsec compact">{children}</section>
      <div className="card">
        <div className="tbl-top"><h2 className="tbl-ttl"><i className="ph ph-stack" />Pieces produced</h2><span className="muted text-sm">Good pieces wait for FG QC; rejected pieces need a reason.</span></div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th style={{ width: '40%' }}>Item (product + size)</th><th className="r">Planned left</th><th>Good pcs</th><th>Rejected pcs</th><th>Reject reason</th><th><span className="sr-only">Remove</span></th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <td data-label="Item">
                    <input type="hidden" name="row" value={r.key} />
                    <input type="hidden" name={`plan_item_${r.key}`} value={r.plan_item} />
                    {r.plan_item
                      ? <><input type="hidden" name={`item_${r.key}`} value={r.item} /><span className="mat-name">{r.label}</span></>
                      : <Combobox name={`item_${r.key}`} value={r.item} onChange={(v) => set(r.key, v)} options={fgOptions} placeholder="Search item…" wide />}
                  </td>
                  <td className="num" data-label="Planned left">{r.planned ?? '—'}</td>
                  <td data-label="Good pcs"><input name={`good_${r.key}`} type="number" inputMode="numeric" min={0} step={1} aria-label="Good pieces" /></td>
                  <td data-label="Rejected pcs"><input name={`rejected_${r.key}`} type="number" inputMode="numeric" min={0} step={1} aria-label="Rejected pieces" /></td>
                  <td data-label="Reject reason"><input name={`reason_${r.key}`} placeholder="Dent, coating, delamination…" aria-label="Reject reason" /></td>
                  <td data-label="">
                    <button type="button" className="btn-link danger" disabled={rows.length === 1} aria-label="Remove row"
                      onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}><i className="ph ph-trash" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="tbl-actions-bar"><div className="tbl-actions-left">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRows((rs) => [...rs, row()])}><i className="ph ph-plus" /> Add item</button>
        </div></div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="tbl-top"><h2 className="tbl-ttl"><i className="ph ph-package" />RM used on the line</h2><span className="muted text-sm">Taken off the line's stock (what was issued to it). Leave empty if not counted this shift.</span></div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th style={{ width: '55%' }}>Material</th><th>Qty used</th><th><span className="sr-only">Remove</span></th></tr></thead>
            <tbody>
              {usage.map((u) => (
                <tr key={u.key}>
                  <td data-label="Material">
                    <Combobox name="material" value={u.material} options={rmOptions} placeholder="Search code or name…" wide
                      onChange={(v) => setUsage((us) => us.map((x) => (x.key === u.key ? { ...x, material: v } : x)))} />
                  </td>
                  <td data-label="Qty used"><input name="qty" type="number" inputMode="decimal" min={0} step="any" aria-label="Quantity used" /></td>
                  <td data-label="">
                    <button type="button" className="btn-link danger" aria-label="Remove material" onClick={() => setUsage((us) => us.filter((x) => x.key !== u.key))}><i className="ph ph-trash" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="tbl-actions-bar"><div className="tbl-actions-left">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setUsage((us) => [...us, { key: ++next.current, material: '' }])}><i className="ph ph-plus" /> Add material</button>
        </div></div>
      </div>
    </ActionForm>
  )
}
