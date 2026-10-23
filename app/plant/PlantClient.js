'use client'
import { useState } from 'react'
import Link from 'next/link'
import { PRODUCTION, balanceOf, int, readyOf } from '@/lib/tas'
import { saveProduction } from '../orders/actions'
import { PlantStatus } from '../ui'
import MarkReadyModal from './MarkReadyModal'

export default function PlantClient({ rows, isOpen, here }) {
  const [selectedIds, setSelectedIds] = useState(() => new Set())

  const openRows = (rows || []).filter((r) => balanceOf(r) > 0)

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (selectedIds.size === openRows.length && openRows.length > 0) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(openRows.map((r) => r.id)))
    }
  }

  // Selected items details
  const selectedRows = (rows || []).filter((r) => selectedIds.has(r.id))
  const selectedOrderIds = Array.from(new Set(selectedRows.map((r) => r.order_id)))
  const singleOrder = selectedOrderIds.length === 1 ? selectedRows[0]?.orders : null

  return (
    <>
      {/* Batch Selection Action Bar */}
      {selectedRows.length > 0 && (
        <div
          style={{
            margin: '0 20px 14px',
            padding: '10px 16px',
            background: 'var(--fill)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-ctl)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="badge b-teal" style={{ fontSize: 13, padding: '4px 10px' }}>
              <i className="ph ph-check-square" /> {selectedRows.length} item{selectedRows.length > 1 ? 's' : ''} selected
            </span>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setSelectedIds(new Set())}
            >
              Clear selection
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {singleOrder ? (
              <>
                <MarkReadyModal
                  orderId={singleOrder.id}
                  lines={selectedRows}
                  back={here}
                  label="Mark Selected Ready"
                  btnClass="btn btn-success btn-sm"
                  size="large"
                />
              </>
            ) : (
              <span className="muted text-sm">
                <i className="ph ph-info" /> Items selected from {selectedOrderIds.length} orders. Select items from 1 order to mark ready.
              </span>
            )}
          </div>
        </div>
      )}

      <div className="tbl-wrap">
        <table className="tbl plant-tbl">
          <thead>
            <tr>
              {isOpen && (
                <th style={{ width: 38, textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    aria-label="Select all"
                    checked={openRows.length > 0 && selectedIds.size === openRows.length}
                    onChange={toggleAll}
                  />
                </th>
              )}
              <th>Quote No</th>
              <th>Customer</th>
              <th>Material Description</th>
              <th className="r">Ordered</th>
              <th className="r">Ready</th>
              <th className="r">Dispatched</th>
              <th className="r">Balance</th>
              <th>Plant Status</th>
              <th>Status</th>
              <th className="r">Action</th>
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
              const displayStatus = isReady ? 'Ready for Dispatch' : (it.production_status || 'Pending')

              let stLabel = 'Pending'
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
                <tr key={it.id} style={isSelected ? { background: 'var(--fill-2)' } : undefined}>
                  {isOpen && (
                    <td style={{ textAlign: 'center' }}>
                      {!isDone ? (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(it.id)}
                          aria-label={`Select line ${it.item_no}`}
                        />
                      ) : (
                        <i className="ph ph-check muted" />
                      )}
                    </td>
                  )}
                  <td className="nowrap">
                    <Link href={`/orders?view=${o?.id}`} className="qno">{o?.quote_no}</Link>
                  </td>
                  <td className="nowrap fw6">
                    <bdi>{o?.customer_name}</bdi>
                  </td>
                  <td className="nowrap">
                    <span>{it.description}</span>
                    {it.color_name && <span className="muted text-sm" style={{ marginLeft: 6 }}>({it.color_name})</span>}
                  </td>
                  <td className="num">{int(it.qty)}</td>
                  <td className="num">
                    {rQty > 0 ? (
                      <span className="badge b-teal" title="Ready, DO not generated yet">{int(rQty)}</span>
                    ) : isReady ? (
                      <span className="badge b-teal">{int(bal)} PCS</span>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td className="num">
                    {int(it.dispatched_qty) || 0}
                  </td>
                  <td className="num fw6">{int(bal)}</td>
                  <td className="nowrap">
                    {isOpen && !isDone ? (
                      <form action={saveProduction}>
                        <input type="hidden" name="id" value={o?.id} />
                        <input type="hidden" name="back" value={here} />
                        <PlantStatus
                          id={it.id}
                          value={displayStatus}
                          coil={it.coil_date}
                          options={PRODUCTION}
                        />
                      </form>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td className="nowrap">
                    <span className={`badge ${stBadge}`}>{stLabel}</span>
                  </td>
                  <td className="nowrap">
                    <div className="row-acts">
                      {isOpen && !isDone && (
                        <>
                          {bal - rQty > 0 ? (
                            <MarkReadyModal
                              orderId={o?.id}
                              lines={[it]}
                              back={here}
                              label={rQty > 0 ? `Add Ready (${int(bal - rQty)} left)` : 'Mark Ready'}
                              btnClass="btn btn-success btn-sm"
                            />
                          ) : (
                            <span className="muted text-sm">All ready — generate DO in Active Orders</span>
                          )}
                        </>
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
            <p>{isOpen ? 'All approved order items have been dispatched.' : 'Nothing dispatched yet.'}</p>
          </div>
        )}
      </div>
    </>
  )
}
