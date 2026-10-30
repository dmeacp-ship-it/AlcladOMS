'use client'
import Link from 'next/link'
import { useState } from 'react'
import { balanceOf, can, dispatchOpen, int, money, readyOf, today, totals } from '@/lib/tas'
import { decide, generateBatchDO, generateBatchPI, uploadTaxInvoice } from './actions'
import { FileDrop, Modal, ModalFoot } from '../ui'

// Order actions: Approve/Reject, Production Floor link, Ship (when ready; makes the DO), Make PI per batch, Tax Invoice.
// Each button shows only to the roles the server lets press it.
// A client component: each dialog is built in the browser when it opens, so a list of 100 orders sends their
// data once instead of every row's dialogs as well. me: just { role }.
export default function OrderActions({ o, me, back, sm, openBatchPi, inDialog, onAction }) {
  const approved = o.status === 'APPROVED'
  const size = sm ? ' btn-sm' : ''
  const t = totals(o.items, o.transport, o.vat_rate)
  const Hidden = (
    <>
      <input type="hidden" name="id" value={o.id} />
      <input type="hidden" name="back" value={back} />
    </>
  )

  // Items are only available for DO generation after plant marks them ready
  const readyLines = (o.items || []).filter((it) => readyOf(it) > 0 && balanceOf(it) > 0)

  const pendingPIBatches = (o.batches || []).filter((b) => b.do_date && !b.pi_date)
  const hasAnyPI = (o.batches || []).some((b) => b.pi_date) || !!o.pi_date

  return (
    <>
      {/* Pending Approval */}
      {o.status === 'PENDING' && can(me, 'approver') && (
        <>
          <Modal title={`Reject ${o.quote_no}`} icon="ph-x-circle" label="Reject" btnIcon="ph-x-circle" btnClass={`btn btn-danger${size}`} size="small">
            <form action={async (fd) => {
              onAction?.(o.id, 'REJECT')
              await decide(fd)
            }}>
              {Hidden}
              <input type="hidden" name="decision" value="reject" />
              <div className="modal-body">
                <div className="fg">
                  <label htmlFor={`reject-${o.id}`}>Reason for rejection <span className="req">*</span></label>
                  <textarea id={`reject-${o.id}`} name="reason" rows={3} required autoFocus placeholder="e.g. margin too low, customer requested changes…" />
                </div>
              </div>
              <ModalFoot label="Reject" icon="ph-x-circle" cls="btn-danger" />
            </form>
          </Modal>
          <Modal title={`Approve ${o.quote_no}`} icon="ph-seal-check" label="Approve" btnIcon="ph-check-circle" btnClass={`btn btn-success${size}`} size="small">
            <form action={async (fd) => {
              onAction?.(o.id, 'APPROVE')
              await decide(fd)
            }}>
              {Hidden}
              <input type="hidden" name="decision" value="approve" />
              <div className="modal-body">
                <p>Approve the quotation for <b><bdi>{o.customer_name}</bdi></b> worth <b>SAR {money(t.total)}</b> (incl. VAT)?</p>
                <p>The order then appears in Ready to Ship, where the plant marks finished pieces ready to ship.</p>
              </div>
              <ModalFoot label="Approve" icon="ph-check-circle" cls="btn-success" />
            </form>
          </Modal>
        </>
      )}

      {/* Approved but nothing is marked ready yet: link directly to Production Floor */}
      {approved && dispatchOpen(o) && readyLines.length === 0 && can(me, 'plant') && (
        <Link prefetch={false} href={`/plant?q=${o.quote_no}`} className={`btn btn-ghost${size}`} title="Go to Ready to Ship to mark finished pieces ready">
          <i className="ph ph-truck" />{sm ? 'Ready' : 'Ready to Ship'}
        </Link>
      )}

      {/* Ship (makes the Delivery Order): only once the plant has marked pieces ready */}
      {approved && readyLines.length > 0 && can(me, 'operations', 'plant') && (
        <ShipAction o={o} lines={readyLines} back={back} size={size} />
      )}

      {/* Per-batch PI and tax invoice. In the order dialog they sit on each batch row instead (inDialog). */}
      {approved && can(me, 'accounts') && !(inDialog && o.batches?.length) && (sm ? pendingPIBatches.slice(0, 1) : pendingPIBatches).map((batch) => (
        <PiAction key={batch.id} o={o} batch={batch} back={back} size={size} autoOpen={String(openBatchPi) === String(batch.id)}
          label={`Make PI${pendingPIBatches.length > 1 ? (sm ? ` (${pendingPIBatches.length})` : ` (${batch.do_no || `#${batch.batch_no}`})`) : ''}`} />
      ))}
      {/* List rows show one next step only: when a PI is waiting, its tax invoices come after it */}
      {approved && can(me, 'accounts') && !(sm && pendingPIBatches.length) && (() => {
        let list = o.batches?.length ? (inDialog ? [] : o.batches.filter((b) => b.pi_date)) : hasAnyPI ? [null] : []
        // List rows show one labelled button for the next missing tax invoice; the order dialog lists every PI.
        if (sm) {
          const missing = list.filter((b) => !(b ? b.tax_invoice_path : o.tax_invoice_path))
          return missing.slice(0, 1).map((b) => (
            <TaxAction key={b?.id || 'order'} o={o} b={b} back={back} size={size}
              label={`Attach tax invoice${missing.length > 1 ? ` (1 of ${missing.length})` : ''}`} />
          ))
        }
        return list.map((b) => {
          const cur = b ? b.tax_invoice_path : o.tax_invoice_path
          return <TaxAction key={b?.id || 'order'} o={o} b={b} back={back} size={size} label={`${cur ? 'Replace tax invoice' : 'Attach tax invoice'}${b?.pi_no ? ` (${b.pi_no})` : ''}`} />
        })
      })()}

    </>
  )
}

// Ship: makes a Delivery Order from lines the plant marked ready (Orders and Production Floor). o: { id, quote_no };
// lines: that order's lines with ready pieces not shipped yet (each starts at its ready quantity).
export function ShipAction({ o, lines, back, size = '', label }) {
  return (
    <Modal
      title={`Ship ${o.quote_no} — Delivery Order`}
      icon="ph-truck"
      label={label || `Ship (${int(lines.reduce((n, it) => n + Math.min(readyOf(it), balanceOf(it)), 0))} PCS ready)`}
      btnIcon="ph-truck"
      btnClass={`btn btn-primary${size}`}
      size="large"
    >
      <form action={generateBatchDO}>
        <input type="hidden" name="id" value={o.id} />
        <input type="hidden" name="back" value={back} />
        <div className="modal-body">
          <p>Lines the plant marked ready. Each quantity starts at the ready quantity; change it if less is going on this truck. Saving makes the Delivery Order.</p>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Material</th>
                  <th>DO qty (PCS)</th>
                  <th className="r">Ready</th>
                  <th className="r">Balance</th>
                  <th className="r">Ordered</th>
                  <th className="r">Dispatched</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((it) => {
                  const balance = balanceOf(it)
                  const rQty = readyOf(it)
                  const defVal = rQty > 0 ? Math.min(rQty, balance) : balance
                  return (
                    <tr key={it.id}>
                      <td className="muted">{it.item_no}</td>
                      <td className="desc wrap">{it.description}</td>
                      <td>
                        <input
                          className="qty"
                          name={`qty_${it.id}`}
                          type="number"
                          inputMode="numeric"
                          min="1"
                          max={balance}
                          step="1"
                          defaultValue={defVal}
                          required
                          aria-label={`DO qty line ${it.item_no}`}
                        />
                      </td>
                      <td className="num fw6">{int(rQty)}</td>
                      <td className="num">{int(balance)}</td>
                      <td className="num">{int(it.qty)}</td>
                      <td className="num">{int(it.dispatched_qty) || 0}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-16">
            <h3 className="sub-ttl"><i className="ph ph-truck" />Dispatch and transport details</h3>
            <div className="fgrid">
              <div className="fg">
                <label htmlFor={`dd-${o.id}`}>Dispatch Date <span className="req">*</span></label>
                <input id={`dd-${o.id}`} type="date" name="dispatch_date" defaultValue={today()} max={today()} required />
              </div>
              <div className="fg">
                <label htmlFor={`vn-${o.id}`}>Vehicle No</label>
                <input id={`vn-${o.id}`} name="vehicle_no" placeholder="e.g. 1234 ABC" maxLength={100} />
              </div>
              <div className="fg">
                <label htmlFor={`tr-${o.id}`}>Transporter</label>
                <input id={`tr-${o.id}`} name="transporter" placeholder="e.g. Al-Saif Logistics" maxLength={100} />
              </div>
              <div className="fg">
                <label htmlFor={`lr-${o.id}`}>LR / Bilty No</label>
                <input id={`lr-${o.id}`} name="lr_no" placeholder="LR number" maxLength={100} />
              </div>
              <div className="fg">
                <label htmlFor={`dr-${o.id}`}>Driver (Name / Mobile)</label>
                <input id={`dr-${o.id}`} name="driver" placeholder="Driver name & phone" maxLength={100} />
              </div>
              <div className="fg">
                <label htmlFor={`tp-${o.id}`}>Transport Charges (SAR)</label>
                <input id={`tp-${o.id}`} type="number" inputMode="decimal" step="0.01" min="0" name="transport" placeholder="0.00" />
              </div>
            </div>
          </div>
        </div>
        <ModalFoot label="Ship & make DO" icon="ph-truck" />
      </form>
    </Modal>
  )
}

// Generate PI for one DO batch (row action in the order dialog, footer / list action elsewhere).
export function PiAction({ o, batch, back, label = 'Make PI', size = ' btn-sm', autoOpen }) {
  // The reason box appears (and is required) only once a unit price differs from the quotation.
  const [changed, setChanged] = useState(false)
  const check = (e) => {
    const f = e.currentTarget
    setChanged([...f.querySelectorAll('input[data-quoted]')].some((i) => Number(i.value) !== Number(i.dataset.quoted)))
  }
  return (
    <Modal
      title={`Make Proforma Invoice for ${batch.do_no || `Batch #${batch.batch_no}`}`}
      icon="ph-receipt"
      label={label}
      btnIcon="ph-receipt"
      btnClass={`btn btn-success${size}`}
      size="large"
      defaultOpen={autoOpen}
    >
      <form action={generateBatchPI} onInput={check}>
        <input type="hidden" name="id" value={o.id} />
        <input type="hidden" name="back" value={back} />
        <input type="hidden" name="batch_id" value={batch.id} />
        <div className="modal-body">
          <p>Quantities come from Delivery Order <b>{batch.do_no}</b>. Change a unit price only if it differs from the quotation.</p>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Material Description</th>
                  <th className="r">DO Qty (PCS)</th>
                  <th className="r">Quoted Price</th>
                  <th>Invoice (PCS)</th>
                  <th>Unit Price (SAR)</th>
                </tr>
              </thead>
              <tbody>
                {(batch.items || []).map((bi, idx) => (
                  <tr key={bi.id}>
                    <td className="muted">{idx + 1}</td>
                    <td className="desc wrap">{bi.order_item?.description || 'Item'}</td>
                    <td className="num fw6">{int(bi.do_qty)}</td>
                    <td className="num">{money(bi.order_item?.price)}</td>
                    <td>
                      <input
                        className="qty"
                        name={`qty_${bi.id}`}
                        type="number"
                        inputMode="numeric"
                        min="0"
                        max={bi.do_qty}
                        step="1"
                        defaultValue={bi.do_qty}
                        required
                        aria-label="Invoice qty"
                      />
                    </td>
                    <td>
                      <input
                        className="qty"
                        name={`price_${bi.id}`}
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.01"
                        defaultValue={bi.order_item?.price || 0}
                        data-quoted={bi.order_item?.price || 0}
                        required
                        aria-label="Unit price"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {changed && (
            <div className="fg pi-reason">
              <label htmlFor={`note-${batch.id}`}>Reason for the price change <span className="req">*</span></label>
              <textarea id={`note-${batch.id}`} name="price_note" rows={2} required placeholder="e.g. special discount approved by management" />
            </div>
          )}
        </div>
        <ModalFoot label="Make PI" icon="ph-receipt" />
      </form>
    </Modal>
  )
}

// Upload or replace the tax invoice of one PI batch (b = null: an order without batches).
export function TaxAction({ o, b, back, label, size = ' btn-sm' }) {
  const cur = b ? b.tax_invoice_path : o.tax_invoice_path
  return (
    <Modal
      title={`${cur ? 'Replace' : 'Attach'} tax invoice for ${b?.pi_no || o.quote_no}`}
      icon="ph-upload-simple"
      label={label || (cur ? 'Replace tax invoice' : 'Attach tax invoice')}
      btnIcon="ph-upload-simple"
      btnClass={`btn ${cur ? 'btn-ghost' : 'btn-warn'}${size}`}
    >
      <form action={uploadTaxInvoice}>
        <input type="hidden" name="id" value={o.id} />
        <input type="hidden" name="back" value={back} />
        {b && <input type="hidden" name="batch_id" value={b.id} />}
        <div className="modal-body">
          <FileDrop name="file" accept="application/pdf,image/*" hint="PDF or image, max 4 MB" maxMB={4} />
          {cur && <p>The file already uploaded will be replaced.</p>}
        </div>
        <ModalFoot label={cur ? 'Replace' : 'Attach'} icon="ph-upload-simple" />
      </form>
    </Modal>
  )
}
