'use client'
import Link from 'next/link'
import { useState } from 'react'
import { day, qty } from '@/lib/tas'
import ActionForm from '../../inventory/ActionForm'

export default function QcForm({ action, rows, shifts }) {
  const [vals, setVals] = useState({})

  const totalGoodPcs = rows.reduce((n, r) => n + Number(r.good_qty || 0), 0)

  const passAllRows = () => {
    const next = {}
    for (const r of rows) {
      next[r.id] = { pass: r.good_qty, b: '', reject: '', reason: '' }
    }
    setVals(next)
  }

  const passSingleRow = (id, goodQty) => {
    setVals((prev) => ({
      ...prev,
      [id]: { pass: goodQty, b: '', reject: '', reason: '' },
    }))
  }

  const updateRow = (id, field, value, goodQty) => {
    setVals((prev) => {
      const current = prev[id] || { pass: '', b: '', reject: '', reason: '' }
      const updated = { ...current, [field]: value }

      if (field === 'reject' || field === 'b') {
        const bNum = Number(field === 'b' ? value : updated.b) || 0
        const rejectNum = Number(field === 'reject' ? value : updated.reject) || 0
        if (bNum > 0 || rejectNum > 0 || current.pass !== '') {
          updated.pass = Math.max(0, goodQty - bNum - rejectNum)
        }
      }

      return { ...prev, [id]: updated }
    })
  }

  return (
    <ActionForm
      action={action}
      className="card"
      submit={{ label: 'Save check — put into stock', icon: 'ph-seal-check', cls: 'btn btn-success' }}
    >
      <div className="tbl-top">
        <div>
          <h2 className="tbl-ttl">
            <i className="ph ph-seal-check" />Waiting to be checked <span className="badge b-warn">{rows.length}</span>
          </h2>
          <span className="muted text-sm">
            Pass + B-grade + Reject must equal the good pieces. Rows left empty stay waiting.
          </span>
        </div>
        <div className="tbl-filters">
          <button type="button" className="btn btn-ghost btn-sm" onClick={passAllRows}>
            <i className="ph ph-check-circle" />Pass all ({qty(totalGoodPcs)} pcs)
          </button>
        </div>
      </div>

      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>DPR</th>
              <th>Item</th>
              <th className="r">Good pcs</th>
              <th>Pass</th>
              <th>B-grade</th>
              <th>Reject</th>
              <th>Reason</th>
              <th>Balance</th>
              <th className="r" style={{ width: 100 }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const current = vals[r.id] || { pass: '', b: '', reject: '', reason: '' }
              const pVal = current.pass !== '' ? Number(current.pass) : null
              const bVal = current.b !== '' ? Number(current.b) : null
              const rVal = current.reject !== '' ? Number(current.reject) : null
              const hasEntry = pVal !== null || bVal !== null || rVal !== null
              const currentSum = (pVal || 0) + (bVal || 0) + (rVal || 0)
              const diff = r.good_qty - currentSum
              const isBalanced = hasEntry && diff === 0

              return (
                <tr key={r.id}>
                  <td className="nowrap" data-label="DPR">
                    <input type="hidden" name="row" value={r.id} />
                    <Link prefetch={false} className="qno" href={`/production/dpr?view=${r.p.id}`}>
                      {r.p.dpr_no}
                    </Link>
                    <span className="mat-sub">
                      {day(r.p.prod_date)} · {shifts[r.p.shift]} · {r.lineLabel}
                    </span>
                  </td>
                  <td data-label="Item">
                    <span className="mat-name">{r.f.code}</span>
                    {r.f.color_name && <span className="mat-sub">{r.f.color_name}</span>}
                  </td>
                  <td className="num fw6" data-label="Good pcs">
                    {qty(r.good_qty)}
                  </td>
                  <td data-label="Pass">
                    <input
                      name={`pass_${r.id}`}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={r.good_qty}
                      step={1}
                      value={current.pass}
                      onChange={(e) => updateRow(r.id, 'pass', e.target.value, r.good_qty)}
                      placeholder={`of ${qty(r.good_qty)}`}
                      aria-label={`Pass, ${r.f.code}`}
                      style={{ width: 85 }}
                    />
                  </td>
                  <td data-label="B-grade">
                    <input
                      name={`b_${r.id}`}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={r.good_qty}
                      step={1}
                      value={current.b}
                      onChange={(e) => updateRow(r.id, 'b', e.target.value, r.good_qty)}
                      placeholder="0"
                      aria-label={`B-grade, ${r.f.code}`}
                      style={{ width: 80 }}
                    />
                  </td>
                  <td data-label="Reject">
                    <input
                      name={`reject_${r.id}`}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={r.good_qty}
                      step={1}
                      value={current.reject}
                      onChange={(e) => updateRow(r.id, 'reject', e.target.value, r.good_qty)}
                      placeholder="0"
                      aria-label={`Reject, ${r.f.code}`}
                      style={{ width: 80 }}
                    />
                  </td>
                  <td data-label="Reason">
                    <input
                      name={`reason_${r.id}`}
                      value={current.reason}
                      onChange={(e) => updateRow(r.id, 'reason', e.target.value, r.good_qty)}
                      placeholder="If B-grade or rejected"
                      aria-label={`Reason, ${r.f.code}`}
                    />
                  </td>
                  <td data-label="Balance">
                    {hasEntry ? (
                      isBalanced ? (
                        <span className="badge b-ok text-xs">Balanced</span>
                      ) : diff > 0 ? (
                        <span className="badge b-bad text-xs">{diff} remaining</span>
                      ) : (
                        <span className="badge b-bad text-xs">{Math.abs(diff)} over</span>
                      )
                    ) : (
                      <span className="muted text-xs">—</span>
                    )}
                  </td>
                  <td className="r" data-label="Action">
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs"
                      onClick={() => passSingleRow(r.id, r.good_qty)}
                      title="Pass all pieces for this row"
                    >
                      <i className="ph ph-check" />Pass all
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </ActionForm>
  )
}
