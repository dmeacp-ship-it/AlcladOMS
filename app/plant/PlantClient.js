'use client'
import { useState } from 'react'
import Link from 'next/link'
import { PRODUCTION, balanceOf, int, plural, readyOf } from '@/lib/tas'
import { saveProduction } from '../orders/actions'
import { PlantStatus } from '../ui'
import MarkReadyModal from './MarkReadyModal'
import { ShipAction } from '../orders/OrderActions'

// Plant lines: tick lines (from one order or several) and mark them ready together, or one at a time; ship ready lines
// (one order per Delivery Order) without going to Orders.
export default function PlantClient({ rows, isOpen, here }) {
  const [selectedIds, setSelectedIds] = useState(() => new Set())

  // Lines that can still take ready pieces.
  const openRows = (rows || []).filter((r) => balanceOf(r) - readyOf(r) > 0)

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const allOn = openRows.length > 0 && openRows.every((r) => selectedIds.has(r.id))
  const toggleAll = () => setSelectedIds(allOn ? new Set() : new Set(openRows.map((r) => r.id)))

  const selectedRows = (rows || []).filter((r) => selectedIds.has(r.id))
  const orderCount = new Set(selectedRows.map((r) => r.order_id)).size
  // Ready lines not shipped yet, per order: a row's Ship button ships all of its order's ready lines.
  const isShippable = (r) => readyOf(r) > 0 && balanceOf(r) > 0
  const readyByOrder = {}
  for (const r of rows || []) if (isShippable(r)) (readyByOrder[r.order_id] ??= []).push(r)
  const selReady = selectedRows.filter(isShippable)
  const selReadyOrders = new Set(selReady.map((r) => r.order_id)).size

  return (
    <>
      {selectedRows.length > 0 && (
        <div className="sel-bar" role="region" aria-label="Selected lines">
          <div className="row">
            <span className="badge b-teal sel-count">
              <i className="ph ph-check-square" /> {plural(selectedRows.length, 'line')}{orderCount > 1 ? ` from ${orderCount} orders` : ''} selected
            </span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelectedIds(new Set())}>
              Clear selection
            </button>
          </div>
          <MarkReadyModal lines={selectedRows} back={here} label="Mark selected ready" btnClass="btn btn-success btn-sm" />
          {selReadyOrders === 1 && <ShipAction o={selReady[0].orders} lines={selReady} back={here} size=" btn-sm" label="Ship selected" />}
          {selReadyOrders > 1 && <span className="muted text-sm">Ship one order at a time</span>}
        </div>
      )}

      <div className="tbl-wrap">
        <table className="tbl plant-tbl">
          <thead>
            <tr>
              {isOpen && (
                <th className="c-sel">
                  <input type="checkbox" aria-label="Select every line that can be marked ready" checked={allOn} onChange={toggleAll} disabled={!openRows.length} />
                </th>
              )}
              <th>Quote No</th>
              <th>Customer</th>
              <th>Material</th>
              <th className="r">Balance</th>
              <th className="r">Ready</th>
              <th>Production</th>
              <th>Dispatch</th>
              <th className="r c-act-h">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows?.map((it) => {
              const o = it.orders
              const bal = balanceOf(it)
              const isDone = bal <= 0
              const isSelected = selectedIds.has(it.id)
              const rQty = readyOf(it)
              const isReady = rQty > 0 && !isDone
              const canAdd = bal - rQty > 0

              let stLabel = 'Not yet'
              let stBadge = 'b-none'
              if (isDone) {
                stLabel = 'Dispatched'
                stBadge = 'b-ok'
              } else if (isReady) {
                stLabel = 'Ready'
                stBadge = 'b-teal'
              } else if (Number(it.dispatched_qty) > 0) {
                stLabel = 'Partial'
                stBadge = 'b-info'
              }

              return (
                <tr key={it.id} className={isSelected ? 'selected' : undefined}>
                  {isOpen && (
                    <td className="c-sel">
                      {canAdd ? (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(it.id)}
                          aria-label={`Select ${o?.quote_no} line ${it.item_no}`}
                        />
                      ) : (
                        <i className="ph ph-check muted" aria-label="Nothing left to mark ready" />
                      )}
                    </td>
                  )}
                  <td className="nowrap c-q">
                    <Link prefetch={false} href={`/orders?view=${o?.id}`} className="qno">{o?.quote_no}</Link>
                  </td>
                  <td className="fw6 c-cust">
                    <bdi>{o?.customer_name}</bdi>
                  </td>
                  <td className="c-desc">
                    <span className="mat-name">{it.description}</span>
                    <span className="mat-sub">
                      {[it.color_name, `Ordered ${int(it.qty)}`, `Dispatched ${int(it.dispatched_qty) || 0}`, it.fg_free != null && `Free in stock ${int(it.fg_free)}`].filter(Boolean).join(' · ')}
                    </span>
                  </td>
                  <td className="num fw6 c-n c-bal" data-label="Balance">{int(bal)}</td>
                  <td className="num c-n c-ready" data-label="Ready">
                    {rQty > 0 ? <span className="badge b-teal" title="Ready, DO not generated yet">{int(rQty)}</span> : <span className="muted">0</span>}
                  </td>
                  <td className="nowrap c-plant">
                    {isOpen && !isDone ? (
                      <form action={saveProduction}>
                        <input type="hidden" name="id" value={o?.id} />
                        <input type="hidden" name="back" value={here} />
                        <PlantStatus id={it.id} value={it.production_status} coil={it.coil_date} options={PRODUCTION} />
                      </form>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td className="nowrap c-st">
                    <span className={`badge ${stBadge}`}>{stLabel}</span>
                  </td>
                  <td className="nowrap c-act">
                    <div className="row-acts">
                      {isOpen && !isDone && canAdd && (
                        <MarkReadyModal
                          lines={[it]}
                          back={here}
                          label={rQty > 0 ? 'Add ready' : 'Mark ready'}
                          btnClass={`btn btn-sm ${isReady ? 'btn-ghost' : 'btn-success'}`}
                        />
                      )}
                      {isOpen && isReady && (
                        <ShipAction o={o} lines={readyByOrder[it.order_id]} back={here} size=" btn-sm"
                          label={`Ship ${int(readyByOrder[it.order_id].reduce((n, r) => n + Math.min(readyOf(r), balanceOf(r)), 0))} PCS`} />
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {!rows?.length && (
          <div className="empty">
            <i className="ph ph-factory" />
            <h3>No lines here</h3>
            <p>{isOpen ? 'Nothing is waiting for the plant right now.' : 'Nothing has been dispatched yet.'}</p>
          </div>
        )}
      </div>
    </>
  )
}
