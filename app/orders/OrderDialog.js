import { DISPATCH, PRODUCTION, balanceOf, can, dispatchOpen, dmy, int, money, readyOf, totals } from '@/lib/tas'
import { cancelOrder, deleteOrder, saveProduction, shortClose, undoDispatch } from './actions'
import { Modal, ModalFoot, PlantStatus, RouteDialog, DocView } from '../ui'
import OrderActions from './OrderActions'

// Order profile shown as a large dialog over the orders list (FMS viewOrderDetails).

const PLANT_BADGE = { Pending: 'b-warn', 'Under Production': 'b-info', 'Coil N/A': 'b-bad' }
const cap = (s) => s[0] + s.slice(1).toLowerCase()
const stamp = (t) => t && new Date(t).toLocaleString('en-GB', { timeZone: 'Asia/Riyadh', dateStyle: 'medium', timeStyle: 'short' })
const Dr = ({ k, v, span }) => (
  <div className={`dr${span ? ` ${span}` : ''}`}><span className="dk">{k}</span><span className="dv">{v || <span className="muted">—</span>}</span></div>
)
const Badge = ({ s }) => <span className={`badge ${DISPATCH[s]?.[1] || 'b-none'}`}>{DISPATCH[s]?.[0] || s}</span>

function Tracker({ o, lastDispatch }) {
  const approved = o.status === 'APPROVED'
  const closed = o.status === 'REJECTED' || o.status === 'CANCELLED'
  const ds = o.dispatch_status
  const batches = o.batches || []
  const hasDO = batches.length > 0 || !!o.do_date
  const hasPI = batches.some((b) => b.pi_date) || !!o.pi_date
  const latestBatch = batches[batches.length - 1]

  const steps = [
    { label: 'Quotation', icon: 'ph-file-text', done: true, time: dmy(o.quote_date) },
    {
      label: closed ? cap(o.status) : 'Approval', icon: closed ? 'ph-x' : 'ph-seal-check',
      done: approved, rejected: closed, active: o.status === 'PENDING',
      time: o.action_at && new Date(o.action_at).toLocaleDateString('en-GB', { timeZone: 'Asia/Riyadh' }).replace(/\//g, '.'),
    },
    { label: 'Delivery Order', icon: 'ph-truck', done: hasDO, active: approved && !hasDO, time: dmy(latestBatch?.do_date || o.do_date) },
    {
      label: ds === 'SHORT_CLOSED' ? 'Short Closed' : 'Dispatch', icon: 'ph-package',
      done: ds === 'DISPATCHED' || ds === 'SHORT_CLOSED', active: dispatchOpen(o),
      time: ds === 'PARTIAL' ? 'Partial' : dmy(lastDispatch),
    },
    { label: 'Proforma Inv.', icon: 'ph-receipt', done: hasPI, active: approved && hasDO && !hasPI, time: dmy(latestBatch?.pi_date || o.pi_date) },
    { label: 'Tax Invoice', icon: 'ph-upload-simple', done: !!o.tax_invoice_path, active: approved && hasPI && !o.tax_invoice_path },
  ]
  return (
    <div className="status-tracker">
      {steps.map((s) => (
        <div key={s.label} className={`status-step${s.done ? ' completed' : s.rejected ? ' rejected' : s.active ? ' active' : ''}`}>
          <div className="step-dot"><i className={`ph ${s.done ? 'ph-check' : s.icon}`} /></div>
          <div className="step-lbl">{s.label}</div>
          <div className="step-time">{s.time || '—'}</div>
        </div>
      ))}
    </div>
  )
}

function nextStep(o) {
  if (o.status === 'PENDING') return ['info', 'ph-hourglass', <>Waiting for an <b>approver</b> to approve or reject this quotation.</>]
  if (o.status === 'REJECTED') return ['error', 'ph-x-circle', <><b>Rejected</b> — {o.reject_reason}. Use <b>Duplicate</b> to correct and resubmit it.</>]
  if (o.status === 'CANCELLED') return ['error', 'ph-prohibit', <><b>Cancelled</b> — {o.reject_reason}</>]

  const batches = o.batches || []
  const hasDO = batches.length > 0 || !!o.do_date
  const pendingPI = batches.filter((b) => b.do_date && !b.pi_date)
  const readyLines = (o.items || []).filter((it) => readyOf(it) > 0 && balanceOf(it) > 0)
  const openBalance = (o.items || []).some((it) => balanceOf(it) > 0)

  const todo = []
  if (readyLines.length > 0) {
    todo.push(<><b>Generate DO</b> for {readyLines.length} item(s) ready for dispatch</>)
  } else if (openBalance) {
    todo.push(<><b>Plant</b> updates production status and marks items ready for dispatch</>)
  }
  if (pendingPI.length) todo.push(<><b>Accounts</b> generates Proforma Invoice for {pendingPI.map((b) => b.do_no || `Batch #${b.batch_no}`).join(', ')}</>)
  else if (hasDO && !o.tax_invoice_path) todo.push(<><b>Accounts</b> uploads tax invoice</>)

  if (!todo.length) return ['ok', 'ph-check-circle', <>Completed — fully dispatched, invoiced and tax invoice uploaded.</>]
  return ['info', 'ph-arrow-right', <>Next: {todo.map((t, i) => <span key={i}>{i ? ' and ' : ''}{t}</span>)}.</>]
}

export default function OrderDialog({ o, history, me, back, closeHref, openBatchPi }) {
  const t = totals(o.items, o.transport)
  const approved = o.status === 'APPROVED'
  const open = dispatchOpen(o)
  const editPlant = open && can(me, 'plant')
  const { dispatches = [], events = [] } = history || {}
  const lineNo = Object.fromEntries(o.items.map((it) => [it.id, it.item_no]))
  const [tone, icon, text] = nextStep(o)
  const Hidden = <><input type="hidden" name="id" value={o.id} /><input type="hidden" name="back" value={back} /></>
  const batches = o.batches || []

  const left = (
    <div className="foot-left">
      {['PENDING', 'APPROVED'].includes(o.status) && !batches.length && !o.do_date && can(me, 'approver') && (
        <Modal title={`Cancel ${o.quote_no}`} icon="ph-prohibit" label="Cancel Order" btnIcon="ph-prohibit" btnClass="btn btn-warn" size="small">
          <form action={cancelOrder}>
            {Hidden}
            <div className="modal-body">
              <p>Cancelling stops this order for good. It is only possible before any Delivery Order is generated.</p>
              <div className="fg">
                <label htmlFor="cancel-reason">Reason for cancelling <span className="req">*</span></label>
                <textarea id="cancel-reason" name="reason" rows={3} required autoFocus placeholder="e.g. customer withdrew the order" />
              </div>
            </div>
            <ModalFoot label="Cancel Order" icon="ph-prohibit" cls="btn-danger" />
          </form>
        </Modal>
      )}
      {open && can(me, 'plant', 'approver') && (
        <Modal title={`Short Close ${o.quote_no}`} icon="ph-scissors" label="Short Close" btnIcon="ph-scissors" btnClass="btn btn-warn" size="small">
          <form action={shortClose}>
            {Hidden}
            <div className="modal-body">
              <p>Stops dispatching the remaining balance of this order — the balance will not ship.</p>
              <div className="fg">
                <label htmlFor="short-reason">Reason for the short close <span className="req">*</span></label>
                <textarea id="short-reason" name="reason" rows={3} required autoFocus placeholder="e.g. customer does not need the balance" />
              </div>
            </div>
            <ModalFoot label="Short Close" icon="ph-scissors" cls="btn-danger" />
          </form>
        </Modal>
      )}
      {can(me, 'sales') && <a className="btn btn-ghost" href={`/orders/new?from=${o.id}`}><i className="ph ph-copy" />Duplicate</a>}
      <Modal title={`Delete Order — ${o.quote_no}`} icon="ph-trash" label="Delete" btnIcon="ph-trash" btnClass="btn btn-danger" size="small">
        <form action={deleteOrder}>
          <input type="hidden" name="id" value={o.id} />
          <div className="modal-body">
            <p>Are you sure you want to permanently delete order <b>{o.quote_no}</b> for <b><bdi>{o.customer_name}</bdi></b>?</p>
            <p className="text-sm red" style={{ marginTop: 8 }}>This action cannot be undone. All items, batches, and dispatches will be removed.</p>
          </div>
          <ModalFoot label="Delete Order" icon="ph-trash" cls="btn-danger" />
        </form>
      </Modal>
    </div>
  )

  const actions = <OrderActions o={o} me={me} back={back} openBatchPi={openBatchPi} />

  return (
    <RouteDialog
      key={o.id}
      icon="ph-package"
      title={<>Order Profile — {o.quote_no} <span className={`badge b-${o.status}`}>{o.status}</span>{o.dispatch_status && <> <Badge s={o.dispatch_status} /></>}</>}
      header={<Tracker o={o} lastDispatch={dispatches[0]?.dispatch_date} />}
      footer={<>{left}{actions}</>}
      closeHref={closeHref}
    >
      <div className={`banner ${tone}`}><i className={`ph ${icon}`} /><span>{text}</span></div>

      <div className="profile-section">
        <div className="profile-section-ttl"><i className="ph ph-storefront" />Customer Details</div>
        <div className="detail-grid">
          <Dr k="Customer" v={<bdi>{o.customer_name}</bdi>} span="span2" />
          <Dr k="Customer Code" v={o.customer_code} />
          <Dr k="Contact" v={o.contact_no} />
          <Dr k="VAT No" v={o.vat_no} />
          <Dr k="CR No" v={o.cr_no} />
          <Dr k="Address" v={o.address} span="full" />
        </div>
      </div>

      <div className="profile-section">
        <div className="profile-section-ttl"><i className="ph ph-info" />Order Details</div>
        <div className="detail-grid">
          <Dr k="Quote Date" v={dmy(o.quote_date)} />
          <Dr k="Salesperson" v={o.salesperson_name} />
          <Dr k="Batches" v={batches.length > 0 ? `${batches.length} Batch(es)` : o.doc_no || 'None'} />
          <Dr k="Order Total" v={<b>SAR {money(t.total)}</b>} />
          {o.action_by && <Dr k={`${o.status === 'PENDING' ? 'Action' : cap(o.status)} by`} v={<>{o.action_by}<br /><span className="muted text-sm">{stamp(o.action_at)}</span></>} />}
          {o.dispatch_status && <Dr k="Dispatch" v={<Badge s={o.dispatch_status} />} />}
          {o.short_close_reason && <Dr k="Short Close Reason" v={o.short_close_reason} span="full" />}
          {o.notes && <Dr k="Notes" v={o.notes} span="full" />}
        </div>
      </div>

      {/* Batches list */}
      {batches.length > 0 && (
        <div className="profile-section">
          <div className="profile-section-ttl">
            <i className="ph ph-truck" />Delivery Order &amp; Invoice Batches <span className="badge b-none">{batches.length}</span>
          </div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Batch #</th>
                  <th>DO No</th>
                  <th>DO Date</th>
                  <th>PI No</th>
                  <th>PI Date</th>
                  <th>Vehicle / Driver</th>
                  <th className="r">Transport</th>
                  <th className="r">Actions</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.id}>
                    <td className="fw6">#{b.batch_no}</td>
                    <td className="nowrap"><b>{b.do_no}</b></td>
                    <td className="nowrap muted">{dmy(b.do_date)}</td>
                    <td className="nowrap">
                      {b.pi_no ? <b>{b.pi_no}</b> : <span className="badge b-warn">Pending PI</span>}
                    </td>
                    <td className="nowrap muted">{dmy(b.pi_date) || '—'}</td>
                    <td className="nowrap muted">
                      {[b.vehicle_no, b.driver].filter(Boolean).join(' · ') || '—'}
                    </td>
                    <td className="num">{money(b.transport)}</td>
                    <td className="nowrap r">
                      <div className="row-acts" style={{ justifyContent: 'flex-end' }}>
                        <a className="btn btn-ghost btn-sm" href={`/orders/${o.id}/print/do?batch=${b.id}`} target="_blank" title="Print Delivery Order">
                          <i className="ph ph-truck" />DO PDF
                        </a>
                        {b.pi_no ? (
                          <a className="btn btn-ghost btn-sm" href={`/orders/${o.id}/print/pi?batch=${b.id}`} target="_blank" title="Print Proforma Invoice">
                            <i className="ph ph-receipt" />PI PDF
                          </a>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Items & status table */}
      <div className="profile-section">
        <div className="profile-section-ttl">
          <i className="ph ph-package" />Items &amp; Dispatch Status <span className="badge b-none">{o.items.length}</span>
          {editPlant && <span className="ttl-hint">Change a line's plant status — it saves straight away.</span>}
        </div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>#</th>
                <th>Material Description</th>
                <th className="r">Ordered</th>
                <th className="r">M2</th>
                <th className="r">Unit Price</th>
                <th className="r">Total</th>
                <th>Plant Status</th>
                <th className="r">Ready</th>
                <th className="r">Dispatched</th>
                <th className="r">Balance</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {o.items.map((it) => {
                const balance = balanceOf(it)
                const isDispatched = balance <= 0
                return (
                  <tr key={it.id}>
                    <td className="muted">{it.item_no}</td>
                    <td className="desc nowrap">{it.description}<div className="muted text-sm" style={{ fontWeight: 400 }}>{it.color_name}</div></td>
                    <td className="num">{int(it.qty)}</td>
                    <td className="num">{money(it.m2)}</td>
                    <td className="num">{money(it.price)}</td>
                    <td className="num fw6">{money(it.total)}</td>
                    <td>
                      {editPlant && balance > 0 ? (
                        <form action={saveProduction}>
                          {Hidden}
                          <PlantStatus id={it.id} value={it.production_status} coil={it.coil_date} options={PRODUCTION} />
                        </form>
                      ) : balance > 0 ? (
                        <span className={`badge ${PLANT_BADGE[it.production_status]}`}>
                          {it.production_status}{it.coil_date && ` · ${dmy(it.coil_date)}`}
                        </span>
                      ) : <span className="muted">—</span>}
                    </td>
                    <td className="num">{int(it.ready_qty) || <span className="muted">—</span>}</td>
                    <td className="num">{int(it.dispatched_qty) || 0}</td>
                    <td className="num fw6">{int(balance)}</td>
                    <td>
                      <span className={`badge ${isDispatched ? 'b-ok' : Number(it.dispatched_qty) > 0 ? 'b-info' : Number(it.ready_qty) > 0 ? 'b-teal' : 'b-none'}`}>
                        {isDispatched ? 'Dispatched' : Number(it.dispatched_qty) > 0 ? 'Partial' : Number(it.ready_qty) > 0 ? 'Ready' : 'Pending'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="sum" style={{ marginTop: 16 }}>
          <div>Subtotal <b>{money(t.subtotal)}</b></div>
          <div>Transport <b>{money(t.transport)}</b></div>
          <div>VAT 15% <b>{money(t.vat)}</b></div>
          <div className="grand">Total (SAR) <b>{money(t.total)}</b></div>
        </div>
      </div>

      {dispatches.length > 0 && (
        <div className="profile-section">
          <div className="profile-section-ttl"><i className="ph ph-truck" />Dispatch History <span className="badge b-none">{dispatches.length}</span></div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Date</th><th>Line</th><th className="r">Qty (PCS)</th><th>Vehicle No</th><th>Transporter</th><th>LR No</th><th>Driver</th><th>By</th>
                  {approved && can(me, 'plant') && <th />}
                </tr>
              </thead>
              <tbody>
                {dispatches.map((d) => (
                  <tr key={d.id}>
                    <td className="nowrap">{dmy(d.dispatch_date)}</td>
                    <td>{lineNo[d.order_item_id]}</td>
                    <td className="num fw6">{int(d.qty)}</td>
                    <td>{d.vehicle_no || <span className="muted">—</span>}</td>
                    <td>{d.transporter || <span className="muted">—</span>}</td>
                    <td>{d.lr_no || <span className="muted">—</span>}</td>
                    <td>{d.driver || <span className="muted">—</span>}</td>
                    <td className="nowrap">{d.by_name}</td>
                    {approved && can(me, 'plant') && (
                      <td>
                        <Modal title="Undo Dispatch" icon="ph-arrow-counter-clockwise" label="Undo" btnIcon="ph-arrow-counter-clockwise" btnClass="btn btn-ghost btn-sm" size="small">
                          <form action={undoDispatch}>
                            {Hidden}<input type="hidden" name="dispatch_id" value={d.id} />
                            <div className="modal-body">
                              <p>Take back <b>{int(d.qty)} PCS</b> of line {lineNo[d.order_item_id]} dispatched on <b>{dmy(d.dispatch_date)}</b>? It goes back into the balance.</p>
                            </div>
                            <ModalFoot label="Undo Dispatch" icon="ph-arrow-counter-clockwise" cls="btn-danger" />
                          </form>
                        </Modal>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="profile-section">
        <div className="profile-section-ttl"><i className="ph ph-files" />Documents</div>
        <div className="docs">
          <DocView href={`/orders/${o.id}/print/quote`} icon="ph-file-text" label="Quotation" />
          {batches.map((b) => (
            <span key={b.id} style={{ display: 'inline-flex', gap: 6 }}>
              <DocView href={`/orders/${o.id}/print/do?batch=${b.id}`} icon="ph-truck" label={<>DO: {b.do_no || `Batch #${b.batch_no}`}</>} />
              {b.pi_no && (
                <DocView href={`/orders/${o.id}/print/pi?batch=${b.id}`} icon="ph-receipt" label={<>PI: {b.pi_no}</>} />
              )}
              {b.tax_invoice_path && (
                <DocView href={`/orders/${o.id}/tax-invoice?batch=${b.id}`} icon="ph-paperclip" label={<>Tax Inv: {b.pi_no}</>} />
              )}
            </span>
          ))}
          {!batches.length && o.do_date && (
            <DocView href={`/orders/${o.id}/print/do`} icon="ph-truck" label="Delivery Order" />
          )}
          {!batches.length && o.pi_date && (
            <DocView href={`/orders/${o.id}/print/pi`} icon="ph-receipt" label="Proforma Invoice" />
          )}
          {!batches.length && o.tax_invoice_path && <DocView href={`/orders/${o.id}/tax-invoice`} icon="ph-paperclip" label="Tax Invoice" />}
        </div>
      </div>

      {events.length > 0 && (
        <div className="profile-section">
          <div className="profile-section-ttl"><i className="ph ph-clock-counter-clockwise" />Timeline</div>
          <ul className="timeline">
            {events.map((e) => (
              <li key={e.id}>
                <span className="tl-at">{stamp(e.at)}</span>
                <span className="tl-what"><b>{e.action}</b> · {e.by_name}{e.detail && <span className="muted">{e.detail}</span>}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </RouteDialog>
  )
}
