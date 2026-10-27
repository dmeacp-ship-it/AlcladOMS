'use client'
import { useState } from 'react'
import { Combobox } from '../ui'
import ActionForm from './ActionForm'

const blank = () => ({ material: '', qty: '', rate: '' })

// PO, issue and adjustment forms: the header fields (children, from the server page) + material lines.
// rate: PO lines also take a unit price. signed: adjustments may be negative (stock lost / found).
export default function LinesForm({ action, materials, rate, signed, submit, children }) {
  const [lines, setLines] = useState([blank()])
  const byId = Object.fromEntries(materials.map((m) => [String(m.id), m]))
  const set = (i, k, v) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)))
  const options = materials.map((m) => ({ value: String(m.id), label: m.name, badge: m.code, sub: [m.category, m.uom].join(' · ') }))

  return (
    <ActionForm action={action} submit={submit}>
      <section className="fsec compact">{children}</section>
      <div className="card">
        <div className="tbl-top"><h2 className="tbl-ttl"><i className="ph ph-package" />Materials</h2></div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr><th>#</th><th style={{ width: '45%' }}>Material</th><th>Qty{signed && ' (+ in / − out)'}</th>{rate && <th>Rate (SAR)</th>}<th>UoM</th><th><span className="sr-only">Remove</span></th></tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i}>
                  <td className="muted" data-label="Line">{i + 1}</td>
                  <td data-label="Material">
                    <Combobox name="material" value={l.material} onChange={(v) => set(i, 'material', v)} options={options}
                      placeholder="Search code or name…" required requiredMsg="Pick a material." wide />
                  </td>
                  <td data-label="Qty">
                    <input name="qty" type="number" inputMode="decimal" step="any" min={signed ? undefined : 0.001} required value={l.qty}
                      onChange={(e) => set(i, 'qty', e.target.value)} aria-label={`Qty line ${i + 1}`} />
                  </td>
                  {rate && (
                    <td data-label="Rate (SAR)">
                      <input name="rate" type="number" inputMode="decimal" step="any" min={0} value={l.rate}
                        onChange={(e) => set(i, 'rate', e.target.value)} aria-label={`Rate line ${i + 1}`} />
                    </td>
                  )}
                  <td className="muted nowrap" data-label="UoM">{byId[l.material]?.uom || '—'}</td>
                  <td data-label="">
                    <button type="button" className="btn-link danger" disabled={lines.length === 1} aria-label={`Remove line ${i + 1}`}
                      onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}><i className="ph ph-trash" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="tbl-actions-bar">
          <div className="tbl-actions-left">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setLines((ls) => [...ls, blank()])}><i className="ph ph-plus" /> Add line</button>
          </div>
        </div>
      </div>
    </ActionForm>
  )
}
