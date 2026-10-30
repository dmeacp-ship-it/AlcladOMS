'use client'
import { startTransition, useActionState, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { day, qty, today } from '@/lib/tas'
import { Combobox, LinkBusy, RouteDialog, UnsavedGuard } from '../../ui'
import { createGRN } from '../actions'

export default function NewGRNDialog({ pos = [], stores = [], selectedPoId, closeHref, list = {} }) {
  const [filter, setFilter] = useState('')
  const term = filter.trim().toLowerCase()

  const po = selectedPoId ? pos.find((p) => String(p.id) === String(selectedPoId)) : null

  const [state, formAction, pending] = useActionState(createGRN, null)
  const errRef = useRef(null)
  useEffect(() => {
    if (state?.error) errRef.current?.focus()
  }, [state])

  const handleSubmit = (e) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(() => formAction(fd))
  }

  // ── State A: Pick approved PO ──
  if (!po) {
    const filteredPos = pos.filter(
      (p) =>
        !term ||
        p.po_no.toLowerCase().includes(term) ||
        p.vendor_name.toLowerCase().includes(term) ||
        p.plant_code.toLowerCase().includes(term),
    )
    const receiveHref = (id) => `/inventory/po?${new URLSearchParams({ ...list, receive: String(id) })}`

    return (
      <RouteDialog
        icon="ph-truck"
        title="Receive Goods"
        closeHref={closeHref}
      >
        {selectedPoId && (
          <div className="banner warn" style={{ marginBottom: 16 }}>
            <i className="ph ph-warning" />
            <span>That purchase order isn't approved and open, so goods can't be received on it. Pick an approved PO below:</span>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
          <span className="muted text-sm">Select an approved purchase order to receive incoming goods against.</span>
          {pos.length > 3 && (
            <div className="sw" style={{ margin: 0, minWidth: 240 }}>
              <i className="ph ph-magnifying-glass" />
              <input
                className="tsearch"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Search PO, vendor, plant…"
                aria-label="Filter purchase orders"
              />
            </div>
          )}
        </div>

        <div className="card">
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>PO No</th>
                  <th>Date</th>
                  <th>Plant</th>
                  <th>Vendor</th>
                  <th className="r">Pending lines</th>
                  <th className="r"><span className="sr-only">Action</span></th>
                </tr>
              </thead>
              <tbody>
                {filteredPos.map((p) => (
                  <tr key={p.id}>
                    <td className="nowrap">
                      <Link prefetch={false} className="qno" href={`/inventory/po?view=${p.id}`}>
                        {p.po_no}
                      </Link>
                    </td>
                    <td className="nowrap" data-label="Date">{day(p.po_date)}</td>
                    <td data-label="Plant">{p.plant_code}</td>
                    <td className="fw6" data-label="Vendor"><bdi>{p.vendor_name}</bdi></td>
                    <td className="num fw6" data-label="Pending lines">
                      {p.items?.filter((i) => i.pending_qty > 0).length ?? 0}
                    </td>
                    <td className="r" data-label="">
                      <Link prefetch={false} className="btn btn-primary btn-sm" href={receiveHref(p.id)} scroll={false}>
                        <LinkBusy /><i className="ph ph-plus" />Receive
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!filteredPos.length && (
              <div className="empty">
                <i className="ph ph-truck" />
                <h3>{term ? 'No matching purchase orders' : 'No approved POs'}</h3>
                <p>{term ? `Nothing matches “${filter}”.` : 'A purchase order must be approved by an admin before goods can be received on it.'}</p>
              </div>
            )}
          </div>
        </div>
      </RouteDialog>
    )
  }

  // ── State B: Fill GRN for selected PO ──
  const items = [...(po.items || [])].sort((a, b) => a.line_no - b.line_no)
  const plantStores = stores.filter((s) => s.plant_code === po.plant_code)
  const rm = plantStores.filter((s) => s.type === 'RM')
  const pickPOHref = `/inventory/po?${new URLSearchParams({ ...list, receive: '1' })}`

  const fillAllPending = () => {
    items.forEach((i) => {
      const el = document.getElementById(`qty_${i.id}`)
      if (el && !el.disabled) {
        el.value = Math.max(0, i.pending_qty)
        el.dispatchEvent(new Event('input', { bubbles: true }))
      }
    })
  }

  const dialogHeader = (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, flexWrap: 'wrap', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span className="badge b-info fw6">{po.po_no}</span>
        <span className="fw6 text-sm"><bdi>{po.vendor_name}</bdi></span>
        <span className="badge b-none">Plant {po.plant_code}</span>
        <span className="muted text-xs">· PO date {day(po.po_date)}</span>
      </div>
      <Link prefetch={false} href={pickPOHref} scroll={false} className="btn btn-ghost btn-sm">
        <i className="ph ph-arrow-left" />Change PO
      </Link>
    </div>
  )

  const footer = (
    <button
      type="submit"
      form="grn-form"
      className="btn btn-primary"
      disabled={pending}
    >
      {pending ? <span className="spin" /> : <i className="ph ph-check" />}
      {pending ? 'Saving…' : 'Save what arrived'}
    </button>
  )

  return (
    <RouteDialog
      icon="ph-truck"
      title="Receive Goods"
      header={dialogHeader}
      footer={footer}
      closeHref={closeHref}
    >
      <form id="grn-form" onSubmit={handleSubmit}>
        <UnsavedGuard />
        <input type="hidden" name="po" value={po.id} />

        {state?.error && (
          <div ref={errRef} tabIndex={-1} role="alert" className="banner error shake" style={{ marginBottom: 14 }}>
            <i className="ph ph-warning-circle" />
            <span><b>Not saved.</b> {state.error}</span>
          </div>
        )}

        <section className="fsec compact">
          <h2 className="fsec-ttl"><i className="ph ph-info" />Receipt Details</h2>
          <div className="grn-header-row">
            <div className="fg">
              <label htmlFor="store">Into store <span className="req">*</span></label>
              <Combobox
                id="store"
                name="store"
                defaultValue={rm.length === 1 ? String(rm[0].id) : ''}
                placeholder="Search or select store…"
                required
                requiredMsg="Choose a store."
                wide
                options={plantStores.map((s) => ({
                  value: String(s.id),
                  label: s.name,
                  badge: s.type,
                  sub: `Plant ${s.plant_code}`,
                }))}
              />
            </div>
            <div className="fg">
              <label htmlFor="date">Received on <span className="req">*</span></label>
              <input id="date" name="date" type="date" defaultValue={today()} max={today()} required />
            </div>
            <div className="fg">
              <label htmlFor="invoice_no">Vendor invoice / DN no.</label>
              <input id="invoice_no" name="invoice_no" placeholder="Invoice or delivery note…" />
            </div>
            <div className="fg">
              <label htmlFor="notes">Notes</label>
              <input id="notes" name="notes" placeholder="Vehicle no, remarks…" />
            </div>
          </div>
          {!plantStores.length && (
            <p className="red text-sm" style={{ marginTop: 10 }}>
              Plant {po.plant_code} has no store yet: add one under Settings → Stores.
            </p>
          )}
        </section>

        <div className="card">
          <div className="tbl-top">
            <div>
              <h2 className="tbl-ttl"><i className="ph ph-package" />Received quantity</h2>
              <span className="muted text-sm">Up to 2% over pending is accepted. Leave blank if nothing came.</span>
            </div>
            {items.some((i) => i.pending_qty > 0) && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={fillAllPending}>
                <i className="ph ph-check-double" />Fill all pending
              </button>
            )}
          </div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Material</th>
                  <th className="r" style={{ width: 140 }}>Ordered</th>
                  <th className="r" style={{ width: 140 }}>Pending</th>
                  <th className="r" style={{ width: 170 }}>Received now</th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => {
                  const maxAllowed = Math.max(0, i.qty * 1.02 - i.received_qty)
                  const isClosed = maxAllowed <= 0
                  return (
                    <tr key={i.id}>
                      <td data-label="Material">
                        <span className="mat-name">{i.m?.name}</span>
                        <span className="mat-sub">{i.m?.code}</span>
                      </td>
                      <td className="num nowrap" data-label="Ordered">
                        {qty(i.qty)} <span className="muted text-xs">{i.m?.uom}</span>
                      </td>
                      <td className="num fw6 nowrap" data-label="Pending">
                        {qty(Math.max(0, i.pending_qty))} <span className="muted text-xs">{i.m?.uom}</span>
                      </td>
                      <td className="r" data-label="Received now">
                        <input type="hidden" name="po_item" value={i.id} />
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                          <input
                            id={`qty_${i.id}`}
                            className="qty"
                            style={{ width: 110, textAlign: 'right' }}
                            name={`qty_${i.id}`}
                            type="number"
                            inputMode="decimal"
                            step="any"
                            min={0}
                            max={maxAllowed}
                            disabled={isClosed}
                            placeholder={isClosed ? 'Complete' : '0'}
                            aria-label={`Received ${i.m?.name}`}
                          />
                          <span className="muted text-xs" style={{ minWidth: 24, textAlign: 'left' }}>{i.m?.uom}</span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </form>
    </RouteDialog>
  )
}
