import Link from 'next/link'
import { DISPATCH, PRODUCTION, STATUS, actionData, balanceOf, can, day, dispatchOpen, int, money, plural, readyOf, totals, vatPct } from '@/lib/tas'
import { cancelOrder, deleteOrder, saveProduction, shortClose, undoDispatch } from './actions'
import { FootMore, Modal, ModalFoot, PlantStatus, RouteDialog, DocView, TypeToConfirm } from '../ui'
import OrderActions, { PiAction, TaxAction } from './OrderActions'

// Order profile shown as a large dialog over the orders list (FMS viewOrderDetails).
// Sections run in the order people work: next step, items and dispatch, DO batches, then the reference
// details and timeline folded closed.

const PLANT_BADGE = { Pending: 'b-warn', 'Under Production': 'b-info', 'Coil N/A': 'b-bad' }
const cap = (s) => s[0] + s.slice(1).toLowerCase()
const stamp = (t) => t && new Date(t).toLocaleString('en-GB', { timeZone: 'Asia/Riyadh', dateStyle: 'medium', timeStyle: 'short' })
// Empty values are left out instead of showing a row of dashes.
const Dr = ({ k, v, span }) => (v ? <div className={`dr${span ? ` ${span}` : ''}`}><span className="dk">{k}</span><span className="dv">{v}</span></div> : null)
const Badge = ({ s }) => <span className={`badge ${DISPATCH[s]?.[1] || 'b-none'}`}>{DISPATCH[s]?.[0] || s}</span>

// DO batch progress: PI and tax invoice are per DO, so an order is only done when every batch is.
export function progress(o) {
  const batches = o.batches || []
  const hasDO = batches.length > 0 || !!o.do_date
  const piDone = batches.length ? batches.filter((b) => b.pi_no).length : o.pi_date ? 1 : 0
  const taxDone = batches.length ? batches.filter((b) => b.tax_invoice_path).length : o.tax_invoice_path ? 1 : 0
  const of = batches.length || (hasDO ? 1 : 0)
  return {
    batches, hasDO, of, piDone, taxDone,
    piPending: batches.length ? batches.filter((b) => b.do_date && !b.pi_no) : hasDO && !o.pi_date ? [{}] : [],
    taxPending: batches.length ? batches.filter((b) => b.pi_no && !b.tax_invoice_path) : o.pi_date && !o.tax_invoice_path ? [{}] : [],
  }
}

function Tracker({ o, lastDispatch }) {
  const approved = o.status === 'APPROVED'
  const closed = o.status === 'REJECTED' || o.status === 'CANCELLED'
  const ds = o.dispatch_status
  const p = progress(o)
  const latest = p.batches[p.batches.length - 1]
  const piAll = p.hasDO && p.piDone === p.of
  const taxAll = piAll && p.taxDone === p.of
  // "1 of 3" while some DOs are still waiting
  const partial = (done) => (p.of > 1 && done < p.of ? `${done} of ${p.of}` : null)

  const steps = [
    { label: 'Quotation', short: 'Quote', icon: 'ph-file-text', done: true, time: day(o.quote_date) },
    {
      label: closed ? cap(o.status) : 'Approval', short: closed ? cap(o.status) : 'Approve', icon: closed ? 'ph-x' : 'ph-seal-check',
      done: approved, rejected: closed, active: o.status === 'PENDING', time: day(o.action_at),
    },
    { label: 'Delivery Order', short: 'DO', icon: 'ph-truck', done: p.hasDO, active: approved && !p.hasDO, time: day(latest?.do_date || o.do_date) },
    {
      label: ds === 'SHORT_CLOSED' ? 'Short Closed' : 'Dispatch', short: ds === 'SHORT_CLOSED' ? 'Closed' : 'Dispatch', icon: 'ph-package',
      done: ds === 'DISPATCHED' || ds === 'SHORT_CLOSED', active: dispatchOpen(o),
      time: ds === 'PARTIAL' ? 'Partial' : day(lastDispatch),
    },
    { label: 'Proforma Inv.', short: 'PI', icon: 'ph-receipt', done: piAll, active: approved && p.piPending.length > 0, time: partial(p.piDone) || day(latest?.pi_date || o.pi_date) },
    { label: 'Tax Invoice', short: 'Tax', icon: 'ph-upload-simple', done: taxAll, active: approved && p.taxPending.length > 0, time: partial(p.taxDone) },
  ]
  return (
    <div className="status-tracker">
      {steps.map((s) => (
        <div key={s.label} className={`status-step${s.done ? ' completed' : s.rejected ? ' rejected' : s.active ? ' active' : ''}`}>
          <div className="step-dot"><i className={`ph ${s.done ? 'ph-check' : s.icon}`} /></div>
          <div className="step-lbl"><span className="lbl-long">{s.label}</span><span className="lbl-short" aria-hidden="true">{s.short}</span></div>
          <div className="step-time">{s.time || '—'}</div>
        </div>
      ))}
    </div>
  )
}

function nextStep(o) {
  if (o.status === 'PENDING') return ['info', 'ph-hourglass', <>Waiting for an <b>approver</b> to approve or reject this quotation.</>]
  if (o.status === 'REJECTED') return ['error', 'ph-x-circle', <><b>Rejected</b>: {o.reject_reason}. Use <b>Duplicate</b> in More to correct and resubmit it.</>]
  if (o.status === 'CANCELLED') return ['error', 'ph-prohibit', <><b>Cancelled</b>: {o.reject_reason}</>]

  const p = progress(o)
  const readyLines = (o.items || []).filter((it) => readyOf(it) > 0 && balanceOf(it) > 0)
  const openBalance = dispatchOpen(o) && (o.items || []).some((it) => balanceOf(it) > 0)
  const name = (b) => b.do_no || (b.batch_no ? `Batch #${b.batch_no}` : 'the DO')

  const todo = []
  if (readyLines.length > 0) todo.push(<><b>Generate DO</b> for {plural(readyLines.length, 'ready line')}</>)
  else if (openBalance) todo.push(<><b>Plant</b> updates production and marks finished pieces ready</>)
  if (p.piPending.length) todo.push(<><b>Accounts</b> generates the PI for {p.piPending.map(name).join(', ')}</>)
  if (p.taxPending.length) todo.push(<><b>Accounts</b> uploads the tax invoice for {p.taxPending.map((b) => b.pi_no || 'the PI').join(', ')}</>)

  if (!todo.length) return ['ok', 'ph-check-circle', <>Completed: dispatched, invoiced and every tax invoice uploaded.</>]
  return ['info', 'ph-arrow-right', <>Next: {todo.map((t, i) => <span key={i}>{i ? (i === todo.length - 1 ? ' and ' : ', ') : ''}{t}</span>)}.</>]
}

export default function OrderDialog({ o, history, me, back, closeHref, openBatchPi }) {
  const t = totals(o.items, o.transport, o.vat_rate)
  const approved = o.status === 'APPROVED'
  const open = dispatchOpen(o)
  const editPlant = open && can(me, 'plant')
  const { dispatches = [], events = [] } = history || {}
  const lineNo = Object.fromEntries(o.items.map((it) => [it.id, it.item_no]))
  const [tone, icon, text] = nextStep(o)
  const Hidden = <><input type="hidden" name="id" value={o.id} /><input type="hidden" name="back" value={back} /></>
  const batches = o.batches || []
  const issued = batches.length > 0 || !!o.do_date || !!o.pi_date

  const left = (
    <FootMore>
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
              <p>Stops dispatching the remaining balance of this order. The balance will not ship.</p>
              <div className="fg">
                <label htmlFor="short-reason">Reason for the short close <span className="req">*</span></label>
                <textarea id="short-reason" name="reason" rows={3} required autoFocus placeholder="e.g. customer does not need the balance" />
              </div>
            </div>
            <ModalFoot label="Short Close" icon="ph-scissors" cls="btn-danger" />
          </form>
        </Modal>
      )}
      {can(me, 'sales') && <Link prefetch={false} className="btn btn-ghost" href={`/orders/new?from=${o.id}`}><i className="ph ph-copy" />Duplicate</Link>}
      {me.role === 'admin' && <Link prefetch={false} className="btn btn-ghost" href={`/orders/${o.id}/edit`}><i className="ph ph-pencil-simple" />Edit order</Link>}
      {me.role === 'admin' && <Modal title={`Delete ${o.quote_no}?`} icon="ph-trash" label="Delete" btnIcon="ph-trash" btnClass="btn btn-danger" size="small">
        <form action={deleteOrder}>
          <input type="hidden" name="id" value={o.id} />
          <TypeToConfirm word={issued ? o.quote_no : null} label="Delete Order" icon="ph-trash">
            <p>Permanently delete <b>{o.quote_no}</b> for <b><bdi>{o.customer_name}</bdi></b>? This can't be undone.</p>
            {issued && (
              <div className="banner error"><i className="ph ph-warning" /><span>
                This order already has {plural(batches.length || 1, 'Delivery Order')}
                {batches.some((b) => b.pi_no) || o.pi_date ? ', Proforma Invoices' : ''}
                {batches.some((b) => b.tax_invoice_path) || o.tax_invoice_path ? ' and uploaded tax invoices' : ''}. All of them, the dispatch history and the timeline are removed.
              </span></div>
            )}
          </TypeToConfirm>
        </form>
      </Modal>}
    </FootMore>
  )

  // Footer keeps only the order's next step (approve, Generate DO…); per-batch PI and tax invoice are on the batch rows.
  // The action buttons are client components: they get only the data their dialogs read (actionData).
  const act = actionData(o)
  const actBatch = Object.fromEntries(act.batches.map((x) => [x.id, x]))
  const actions = <OrderActions o={act} me={{ role: me.role }} back={back} openBatchPi={openBatchPi} inDialog />

  return (
    <RouteDialog
      key={o.id}
      icon="ph-package"
      title={<>Order {o.quote_no} <span className={`badge b-${o.status}`}>{STATUS[o.status] || o.status}</span>{o.dispatch_status && <> <Badge s={o.dispatch_status} /></>}</>}
      header={<Tracker o={o} lastDispatch={dispatches[0]?.dispatch_date} />}
      footer={<>{left}{actions}</>}
      closeHref={closeHref}
    >
      <div className={`banner ${tone}`}><i className={`ph ${icon}`} /><span>{text}</span></div>

      <section className="profile-section">
        <h2 className="profile-section-ttl">
          <i className="ph ph-package" />Items and dispatch <span className="badge b-none">{o.items.length}</span>
          {editPlant && <span className="ttl-hint">Production changes save straight away.</span>}
        </h2>
        <div className="tbl-wrap">
          <table className="tbl items-tbl">
            <thead>
              <tr>
                <th>#</th>
                <th>Material</th>
                <th className="r">Ordered</th>
                <th className="r">Ready</th>
                <th className="r">Dispatched</th>
                <th className="r">Balance</th>
                <th>Production</th>
                <th>Dispatch</th>
              </tr>
            </thead>
            <tbody>
              {o.items.map((it) => {
                const balance = balanceOf(it)
                const isDispatched = balance <= 0
                return (
                  <tr key={it.id}>
                    <td className="muted c-no">{it.item_no}</td>
                    <td className="c-mat">
                      <span className="mat-name">{it.description}</span>
                      <span className="mat-sub">
                        {[it.color_name, Number(it.m2) > 0 && `${money(it.m2)} m²`, `SAR ${money(it.price)}${Number(it.m2) > 0 ? '/m²' : '/pc'}`].filter(Boolean).join(' · ')}
                        {' · '}<b>SAR {money(it.total)}</b>
                      </span>
                    </td>
                    <td className="num c-n" data-label="Ordered">{int(it.qty)}</td>
                    <td className="num c-n" data-label="Ready">{int(it.ready_qty) || <span className="muted">0</span>}</td>
                    <td className="num c-n" data-label="Dispatched">{int(it.dispatched_qty) || 0}</td>
                    <td className="num fw6 c-n" data-label="Balance">{int(balance)}</td>
                    <td className="c-plant">
                      {editPlant && balance > 0 ? (
                        <form action={saveProduction}>
                          {Hidden}
                          <PlantStatus id={it.id} value={it.production_status} coil={it.coil_date} options={PRODUCTION} />
                        </form>
                      ) : balance > 0 ? (
                        <span className={`badge ${PLANT_BADGE[it.production_status] || 'b-none'}`}>
                          {it.production_status}{it.coil_date && ` · ${day(it.coil_date)}`}
                        </span>
                      ) : <span className="muted">—</span>}
                    </td>
                    <td className="c-st">
                      <span className={`badge ${isDispatched ? 'b-ok' : Number(it.dispatched_qty) > 0 ? 'b-info' : Number(it.ready_qty) > 0 ? 'b-teal' : 'b-none'}`}>
                        {isDispatched ? 'Dispatched' : Number(it.dispatched_qty) > 0 ? 'Partial' : Number(it.ready_qty) > 0 ? 'Ready' : 'Not yet'}
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
          <div>VAT {vatPct(o.vat_rate)} <b>{money(t.vat)}</b></div>
          <div className="grand">Total (SAR) <b>{money(t.total)}</b></div>
        </div>
      </section>

      {batches.length > 0 && (
        <section className="profile-section">
          <h2 className="profile-section-ttl">
            <i className="ph ph-truck" />Delivery Orders and invoices <span className="badge b-none">{batches.length}</span>
          </h2>
          <div className="tbl-wrap">
            <table className="tbl batch-tbl">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Delivery Order</th>
                  <th>Proforma Invoice</th>
                  <th>Tax Invoice</th>
                  <th>Truck</th>
                  <th className="r">Documents and next step</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.id}>
                    <td className="fw6 muted">{b.batch_no}</td>
                    <td><b className="doc-ref">{b.do_no}</b><div className="muted text-sm">{day(b.do_date)}</div></td>
                    <td>
                      {b.pi_no ? <><b className="doc-ref">{b.pi_no}</b><div className="muted text-sm">{day(b.pi_date)}</div></> : <span className="badge b-warn">PI pending</span>}
                    </td>
                    <td>
                      {b.tax_invoice_path ? <span className="badge b-ok"><i className="ph ph-check" />Uploaded</span>
                        : b.pi_no ? <span className="badge b-warn">Pending</span> : <span className="muted">—</span>}
                    </td>
                    <td>
                      {[b.vehicle_no, b.driver].filter(Boolean).join(' · ') || <span className="muted">—</span>}
                      {Number(b.transport) > 0 && <div className="muted text-sm">Transport SAR {money(b.transport)}</div>}
                    </td>
                    <td className="r">
                      {/* View first, then this batch's next step (Generate PI, or upload / replace its tax invoice) */}
                      <div className="row-acts wrap">
                        <DocView href={`/orders/${o.id}/print/do?batch=${b.id}`} icon="ph-truck" label="DO" title={`Delivery Order ${b.do_no}`} />
                        {b.pi_no && <DocView href={`/orders/${o.id}/print/pi?batch=${b.id}`} icon="ph-receipt" label="PI" title={`Proforma Invoice ${b.pi_no}`} />}
                        {b.tax_invoice_path && <DocView href={`/orders/${o.id}/tax-invoice?batch=${b.id}`} icon="ph-paperclip" label="Tax inv." title={`Tax Invoice ${b.pi_no}`} />}
                        {approved && !b.pi_no && (
                          <PiAction o={act} batch={actBatch[b.id]} back={back} autoOpen={String(openBatchPi) === String(b.id)} />
                        )}
                        {approved && b.pi_no && can(me, 'accounts') && (
                          <TaxAction o={act} b={actBatch[b.id]} back={back} label={b.tax_invoice_path ? 'Replace' : 'Upload invoice'} />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {dispatches.length > 0 && (
        <section className="profile-section">
          <h2 className="profile-section-ttl"><i className="ph ph-truck" />Dispatch history <span className="badge b-none">{dispatches.length}</span></h2>
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
                    <td className="nowrap">{day(d.dispatch_date)}</td>
                    <td>{lineNo[d.order_item_id]}</td>
                    <td className="num fw6">{int(d.qty)}</td>
                    <td>{d.vehicle_no || <span className="muted">—</span>}</td>
                    <td>{d.transporter || <span className="muted">—</span>}</td>
                    <td>{d.lr_no || <span className="muted">—</span>}</td>
                    <td>{d.driver || <span className="muted">—</span>}</td>
                    <td className="nowrap">{d.by_name}</td>
                    {approved && can(me, 'plant') && (
                      <td>
                        <Modal title="Undo dispatch" icon="ph-arrow-counter-clockwise" label="Undo" btnIcon="ph-arrow-counter-clockwise" btnClass="btn btn-ghost btn-sm" size="small">
                          <form action={undoDispatch}>
                            {Hidden}<input type="hidden" name="dispatch_id" value={d.id} />
                            <div className="modal-body">
                              <p>Take back <b>{int(d.qty)} PCS</b> of line {lineNo[d.order_item_id]} dispatched on <b>{day(d.dispatch_date)}</b>? It goes back into the balance.</p>
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
        </section>
      )}

      <details className="profile-section disclosure">
        <summary className="profile-section-ttl">
          <i className="ph ph-storefront" />Customer and order details
          <span className="ttl-hint"><bdi>{o.customer_name}</bdi> · {o.salesperson_name} · SAR {money(t.total)}</span>
          <i className="ph ph-caret-down disc-caret" aria-hidden="true" />
        </summary>
        <div className="detail-grid">
          <Dr k="Customer" v={<bdi>{o.customer_name}</bdi>} span="span2" />
          <Dr k="Customer code" v={o.customer_code} />
          <Dr k="Contact" v={o.contact_no} />
          <Dr k="VAT no" v={o.vat_no} />
          <Dr k="CR no" v={o.cr_no} />
          <Dr k="Address" v={o.address} span="full" />
          <Dr k="Quote date" v={day(o.quote_date)} />
          <Dr k="Salesperson" v={o.salesperson_name} />
          <Dr k="Delivery Orders" v={batches.length > 0 ? String(batches.length) : o.doc_no} />
          <Dr k="Order total" v={<b>SAR {money(t.total)}</b>} />
          {o.action_by && <Dr k={`${o.status === 'PENDING' ? 'Action' : cap(o.status)} by`} v={<>{o.action_by}<br /><span className="muted text-sm">{stamp(o.action_at)}</span></>} />}
          <Dr k="Short close reason" v={o.short_close_reason} span="full" />
          <Dr k="Notes" v={o.notes} span="full" />
        </div>
        <div className="docs doc-line">
          <span className="muted text-sm">Documents:</span>
          <DocView href={`/orders/${o.id}/print/quote`} icon="ph-file-text" label="Quotation" />
          {!batches.length && o.do_date && <DocView href={`/orders/${o.id}/print/do`} icon="ph-truck" label="Delivery Order" />}
          {!batches.length && o.pi_date && <DocView href={`/orders/${o.id}/print/pi`} icon="ph-receipt" label="Proforma Invoice" />}
          {!batches.length && o.tax_invoice_path && <DocView href={`/orders/${o.id}/tax-invoice`} icon="ph-paperclip" label="Tax Invoice" />}
        </div>
      </details>

      {events.length > 0 && (
        <details className="profile-section disclosure">
          <summary className="profile-section-ttl">
            <i className="ph ph-clock-counter-clockwise" />Timeline <span className="badge b-none">{events.length}</span>
            <span className="ttl-hint">Last: {events[0].action}, {stamp(events[0].at)}</span>
            <i className="ph ph-caret-down disc-caret" aria-hidden="true" />
          </summary>
          <ul className="timeline">
            {events.map((e) => (
              <li key={e.id}>
                <span className="tl-at">{stamp(e.at)}</span>
                <span className="tl-what"><b>{e.action}</b> · {e.by_name}{e.detail && <span className="muted">{e.detail}</span>}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </RouteDialog>
  )
}
