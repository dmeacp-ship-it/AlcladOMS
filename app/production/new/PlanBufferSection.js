'use client'
import { useState } from 'react'
import { Combobox } from '../../ui'
import { money } from '@/lib/tas'
import FgSpecModal from '../FgSpecModal'

export default function PlanBufferSection({ catalogItems = [], options = {} }) {
  const [itemsList, setItemsList] = useState(catalogItems)
  const [bufferRows, setBufferRows] = useState([])
  const [selectedItem, setSelectedItem] = useState('')
  const [specModalOpen, setSpecModalOpen] = useState(false)

  const catalogOptions = itemsList
    .filter((f) => !f.b_grade && !bufferRows.some((b) => String(b.id) === String(f.id)))
    .map((f) => ({
      value: String(f.id),
      label: f.code,
      sub: [f.color_name, f.m2_per_pc ? `${money(f.m2_per_pc)} M² / pc` : ''].filter(Boolean).join(' · '),
    }))

  const addFromCatalog = (id) => {
    if (!id) return
    const it = itemsList.find((x) => String(x.id) === String(id))
    if (!it) return
    setBufferRows((prev) => [...prev, { ...it, defaultQty: '' }])
    setSelectedItem('')
  }

  const handleSpecSelect = (item) => {
    setItemsList((prev) => (prev.some((x) => String(x.id) === String(item.id)) ? prev : [item, ...prev]))
    setBufferRows((prev) => {
      if (prev.some((x) => String(x.id) === String(item.id))) return prev
      return [...prev, { ...item, defaultQty: '' }]
    })
  }

  const removeRow = (id) => {
    setBufferRows((prev) => prev.filter((r) => String(r.id) !== String(id)))
  }

  return (
    <div className="card mt-16">
      <div className="tbl-top">
        <h2 className="tbl-ttl">
          <i className="ph ph-stack" />
          Make-to-Stock / Buffer stock items
          {bufferRows.length > 0 && <span className="badge b-none">{bufferRows.length}</span>}
        </h2>
        <span className="muted text-sm">Plan panels directly into stock without waiting for customer orders.</span>
      </div>

      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ width: '45%' }}>Item (product + size)</th>
              <th>Color</th>
              <th className="r">Area / pc</th>
              <th style={{ width: 140 }}>Make in this plan (pcs)</th>
              <th><span className="sr-only">Remove</span></th>
            </tr>
          </thead>
          <tbody>
            {bufferRows.map((r) => (
              <tr key={r.id}>
                <td data-label="Item">
                  <input type="hidden" name="item" value={r.id} />
                  <span className="mat-name">{r.code}</span>
                </td>
                <td data-label="Color">{r.color_name || <span className="muted">—</span>}</td>
                <td className="num" data-label="Area / pc">
                  {r.m2_per_pc ? `${money(r.m2_per_pc)} M²` : <span className="muted">—</span>}
                </td>
                <td data-label="Make in this plan">
                  <input
                    name={`qty_${r.id}`}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    step={1}
                    placeholder="Pieces"
                    required
                    aria-label={`Pieces to plan, ${r.code}`}
                    style={{ width: 110 }}
                  />
                </td>
                <td data-label="">
                  <button
                    type="button"
                    className="btn-link danger"
                    title="Remove item"
                    aria-label={`Remove ${r.code}`}
                    onClick={() => removeRow(r.id)}
                  >
                    <i className="ph ph-trash" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {bufferRows.length === 0 && (
          <div className="empty" style={{ padding: '24px 16px' }}>
            <p className="muted m-0">
              No buffer items added yet. Use the buttons below to pick existing catalog items or configure custom sizes.
            </p>
          </div>
        )}
      </div>

      <div className="tbl-actions-bar">
        <div className="tbl-actions-left d-flex gap-10 ai-c f-wrap">
          <div style={{ minWidth: 260, maxWidth: 360 }}>
            <Combobox
              value={selectedItem}
              onChange={addFromCatalog}
              options={catalogOptions}
              placeholder="Search & add from catalog…"
            />
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setSpecModalOpen(true)}
          >
            <i className="ph ph-sliders-horizontal" /> Custom size / product
          </button>
        </div>
      </div>

      <FgSpecModal
        open={specModalOpen}
        onClose={() => setSpecModalOpen(false)}
        onSelect={handleSpecSelect}
        options={options}
      />
    </div>
  )
}
