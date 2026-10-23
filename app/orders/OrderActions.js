import Link from 'next/link'
import { balanceOf, can, dispatchOpen, int, money, readyOf, today, totals } from '@/lib/tas'
import { decide, deleteOrder, generateBatchDO, generateBatchPI, uploadTaxInvoice } from './actions'
import { FileDrop, Modal, ModalFoot } from '../ui'

// Order actions: Approve/Reject, Plant Dispatch link, Generate DO (when ready), Generate PI per batch, Tax Invoice.
export default function OrderActions({ o, me, back, sm, openBatchPi, inDialog }) {
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
            <form action={decide}>
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
            <form action={decide}>
              {Hidden}
              <input type="hidden" name="decision" value="approve" />
              <div className="modal-body">
                <p>Approve the quotation for <b><bdi>{o.customer_name}</bdi></b> worth <b>SAR {money(t.total)}</b> (incl. VAT)?</p>
                <p>Order will immediately go to Plant Dispatch for production status and ready quantities.</p>
              </div>
              <ModalFoot label="Approve" icon="ph-check-circle" cls="btn-success" />
            </form>
          </Modal>
        </>
      )}

      {/* Approved but nothing is marked ready yet: link directly to Plant Dispatch */}
      {approved && !sm && dispatchOpen(o) && readyLines.length === 0 && (
        <Link href="/plant" className={`btn btn-ghost${size}`} title="Go to Plant Dispatch to update status and mark ready quantities">
          <i className="ph ph-factory" />Plant Dispatch
        </Link>
      )}

      {/* Generate DO & Dispatch: ONLY appears when plant has marked items ready for dispatch */}
      {approved && readyLines.length > 0 && (
        <Modal
          title={`Generate Delivery Order & Dispatch — ${o.quote_no}`}
          icon="ph-truck"
          label={`Generate DO (${int(readyLines.reduce((n, it) => n + Math.min(readyOf(it), balanceOf(it)), 0))} PCS Ready)`}
          btnIcon="ph-truck"
          btnClass={`btn btn-primary${size}`}
          size="large"
        >
          <form action={generateBatchDO}>
            {Hidden}
            <div className="modal-body">
              <p>
                Generating Delivery Order for items marked ready for dispatch.
                Quantities are prefilled with the ready quantity confirmed by the plant.
              </p>
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Material Description</th>
                      <th className="r">Ordered</th>
                      <th className="r">Dispatched</th>
                      <th className="r">Balance</th>
                      <th className="r">Ready</th>
                      <th>DO Qty (PCS)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {readyLines.map((it) => {
                      const balance = balanceOf(it)
                      const rQty = readyOf(it)
                      const defVal = rQty > 0 ? Math.min(rQty, balance) : balance
                      return (
                        <tr key={it.id}>
                          <td className="muted">{it.item_no}</td>
                          <td className="desc">{it.description}</td>
                          <td className="num">{int(it.qty)}</td>
                          <td className="num">{int(it.dispatched_qty) || 0}</td>
                          <td className="num fw6">{int(balance)}</td>
                          <td className="num fw6" style={{ color: 'var(--teal-fg)' }}>{int(defVal)} PCS</td>
                          <td>
                            <input
                              className="qty"
                              name={`qty_${it.id}`}
                              type="number"
                              min="1"
                              max={balance}
                              step="1"
                              defaultValue={defVal}
                              required
                              aria-label={`DO qty line ${it.item_no}`}
                            />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div style={{ marginTop: 16 }}>
                <h4 style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                  <i className="ph ph-truck" /> Dispatch &amp; Transport Details
                </h4>
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
                    <input id={`tp-${o.id}`} type="number" step="0.01" min="0" name="transport" placeholder="0.00" />
                  </div>
                </div>
              </div>
            </div>
            <ModalFoot label="Generate DO & Dispatch" icon="ph-truck" />
          </form>
        </Modal>
      )}

      {/* Per-batch PI and tax invoice. In the order dialog they sit on each batch row instead (inDialog). */}
      {approved && !(inDialog && o.batches?.length) && pendingPIBatches.map((batch) => (
        <PiAction key={batch.id} o={o} batch={batch} back={back} size={size} autoOpen={String(openBatchPi) === String(batch.id)}
          label={`Generate PI${pendingPIBatches.length > 1 ? ` (${batch.do_no || `#${batch.batch_no}`})` : ''}`} />
      ))}
      {approved && can(me, 'accounts') && (o.batches?.length ? (inDialog ? [] : o.batches.filter((b) => b.pi_date)) : hasAnyPI ? [null] : []).map((b) => {
        const cur = b ? b.tax_invoice_path : o.tax_invoice_path
        if (sm && cur) return null
        return <TaxAction key={b?.id || 'order'} o={o} b={b} back={back} size={size} label={`${cur ? 'Replace' : 'Upload'} Invoice${b?.pi_no ? ` (${b.pi_no})` : ''}`} />
      })}

      {/* Delete order (admin only) */}
      {sm && me.role === 'admin' && (
        <Modal
          title={`Delete Order — ${o.quote_no}`}
          icon="ph-trash"
          label=""
          btnIcon="ph-trash"
          btnClass="btn btn-ghost btn-sm red"
          ariaLabel="Delete Order"
          size="small"
        >
          <form action={deleteOrder}>
            <input type="hidden" name="id" value={o.id} />
            <div className="modal-body">
              <p>Permanently delete order <b>{o.quote_no}</b>?</p>
              <p className="text-sm red" style={{ marginTop: 8 }}>This will remove the order and all related items and batches.</p>
            </div>
            <ModalFoot label="Delete" icon="ph-trash" cls="btn-danger" />
          </form>
        </Modal>
      )}
    </>
  )
}

// Generate PI for one DO batch (row action in the order dialog, footer / list action elsewhere).
export function PiAction({ o, batch, back, label = 'Generate PI', size = ' btn-sm', autoOpen }) {
  return (
    <Modal
      title={`Generate Proforma Invoice — ${batch.do_no || `Batch #${batch.batch_no}`}`}
      icon="ph-receipt"
      label={label}
      btnIcon="ph-receipt"
      btnClass={`btn btn-success${size}`}
      size="large"
      defaultOpen={autoOpen}
    >
      <form action={generateBatchPI}>
        <input type="hidden" name="id" value={o.id} />
        <input type="hidden" name="back" value={back} />
        <input type="hidden" name="batch_id" value={batch.id} />
        <div className="modal-body">
          <p>Quantities are pre-filled from this Delivery Order (<b>{batch.do_no}</b>). If you modify a quoted unit price, provide a reason.</p>
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
                    <td className="desc">{bi.order_item?.description || 'Item'}</td>
                    <td className="num fw6">{int(bi.do_qty)}</td>
                    <td className="num">{money(bi.order_item?.price)}</td>
                    <td>
                      <input
                        className="qty"
                        name={`qty_${bi.id}`}
                        type="number"
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
                        min="0"
                        step="0.01"
                        defaultValue={bi.order_item?.price || 0}
                        required
                        aria-label="Unit price"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="fg" style={{ marginTop: 14 }}>
            <label htmlFor={`note-${batch.id}`}>Reason for price change <span className="hint">— only if a unit price differs from quotation</span></label>
            <textarea id={`note-${batch.id}`} name="price_note" rows={2} placeholder="e.g. special discount approved by management" />
          </div>
        </div>
        <ModalFoot label="Generate PI" icon="ph-receipt" />
      </form>
    </Modal>
  )
}

// Upload or replace the tax invoice of one PI batch (b = null: an order without batches).
export function TaxAction({ o, b, back, label, size = ' btn-sm' }) {
  const cur = b ? b.tax_invoice_path : o.tax_invoice_path
  return (
    <Modal
      title={`${cur ? 'Replace' : 'Upload'} Tax Invoice — ${b?.pi_no || o.quote_no}`}
      icon="ph-upload-simple"
      label={label || (cur ? 'Replace invoice' : 'Upload invoice')}
      btnIcon="ph-upload-simple"
      btnClass={`btn ${cur ? 'btn-ghost' : 'btn-warn'}${size}`}
    >
      <form action={uploadTaxInvoice}>
        <input type="hidden" name="id" value={o.id} />
        <input type="hidden" name="back" value={back} />
        {b && <input type="hidden" name="batch_id" value={b.id} />}
        <div className="modal-body">
          <FileDrop name="file" accept="application/pdf,image/*" hint="PDF or image, max 4 MB" />
          {cur && <p>The file already uploaded will be replaced.</p>}
        </div>
        <ModalFoot label="Upload" icon="ph-upload-simple" />
      </form>
    </Modal>
  )
}
