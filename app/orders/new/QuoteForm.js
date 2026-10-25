'use client'
import { startTransition, useActionState, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { createQuote, updateOrder } from '../actions'
import { calcM2, day, describe, lineTotal, money, plural, today, totals, vatPct } from '@/lib/tas'
import { Combobox, UnsavedGuard } from '../../ui'

const PICKS = ['brand', 'color_code', 'grade', 'core', 'skin', 'width', 'length', 'thickness']
const LABELS = { grade: 'Grade', core: 'Core', skin: 'Al skin', width: 'Width', length: 'Length', thickness: 'Thickness' }
const blank = () => ({ brand: '', color_code: '', grade: '', core: '', skin: '', width: '', length: '', thickness: '', qty: '', price: '' })

// Read-only values are shown as text, so they don't look like fields you can type in.
const Ro = ({ label, value, span2 }) => (
  <div className={`fg${span2 ? ' span2' : ''}`}><span className="lbl">{label}</span><div className="ro plain">{value || <span className="muted">—</span>}</div></div>
)
// Phone keyboards: sizes get the number pad, thicknesses a decimal pad.
const INPUT_MODE = { width: 'numeric', length: 'numeric', thickness: 'decimal', skin: 'decimal' }

// New quotation, or (edit set) an admin correcting an existing order: edit = { id, quote_no, quote_date, vat_rate }.
// Lines of an edited order carry id, plus min (already dispatched) and locked (on a DO, can't be removed).
export default function QuoteForm({ customers, options, salespersons, me, initial, edit, exposure = {}, vatRate }) {
  const [state, action, pending] = useActionState(edit ? updateOrder : createQuote, null)
  const [customerId, setCustomerId] = useState(initial?.customer_id || '')
  const [spId, setSpId] = useState(initial?.salesperson_id || String(me.id))
  // Start with only 1 blank row by default, or existing lines if copying an earlier quote
  const [lines, setLines] = useState(() => (initial?.lines?.length ? initial.lines : [blank()]))
  const [transport, setTransport] = useState(initial?.transport || '0')
  const confirmRef = useRef(null)
  const formData = useRef(null)
  const errRef = useRef(null)
  // A server error shows at the top of the form: bring it into view and give it focus.
  useEffect(() => {
    if (!state?.error) return
    errRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    errRef.current?.focus({ preventScroll: true })
  }, [state])

  const c = customers.find((x) => String(x.id) === customerId)
  const colors = options.color || {}
  const calc = lines.map((l) => {
    const m2 = calcM2(+l.width, +l.length, +l.qty)
    return { color_name: colors[l.color_code] || '', description: l.brand ? describe(l) : '', m2, total: lineTotal(m2, +l.qty, +l.price) }
  })
  const rate = edit ? edit.vat_rate : vatRate
  const t = totals(calc, +transport || 0, rate)
  const filled = lines.filter((l) => l.brand && +l.qty > 0).length
  // Credit limit: open orders of this customer plus this quote.
  const limit = c?.credit_limit != null ? Number(c.credit_limit) : null
  const used = (exposure[c?.id] || 0) + t.total
  const overLimit = limit != null && used > limit
  const pickCustomer = (val) => {
    setCustomerId(val)
    const sp = customers.find((x) => String(x.id) === val)?.salesperson_id
    if (sp && salespersons?.some((s) => s.id === sp)) setSpId(sp)
  }
  const set = (i, k, v) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)))
  const pick = (i, k) => (
    <input name={k} list={`opt-${k}`} value={lines[i][k]} inputMode={INPUT_MODE[k]} onChange={(e) => set(i, k, e.target.value)} aria-label={`${k.replace('_', ' ')} line ${i + 1}`} />
  )

  const addRows = (count = 1) => {
    const n = Math.max(1, Math.min(Number(count) || 1, 50))
    setLines((ls) => [...ls, ...Array.from({ length: n }, blank)])
  }

  // Browser validation passes first, then the FMS-style confirm dialog; a plain <form action>
  // would also reset the typed lines after a server-side error.
  function submit(e) {
    e.preventDefault()
    formData.current = new FormData(e.currentTarget)
    confirmRef.current.showModal()
  }
  function confirm() {
    confirmRef.current.close()
    startTransition(() => action(formData.current))
  }

  return (
    <form onSubmit={submit}>
      <UnsavedGuard />
      {state?.error && <div ref={errRef} tabIndex={-1} role="alert" className="banner error shake"><i className="ph ph-warning-circle" /><span><b>Not submitted.</b> {state.error}</span></div>}
      {edit && <input type="hidden" name="order_id" value={edit.id} />}
      {edit && (
        <div className="banner warn"><i className="ph ph-pencil-simple" />
          <span>Editing <b>{edit.quote_no}</b> as admin. The status, DOs and PIs stay as they are; lines already dispatched can't go below the dispatched quantity or be removed. Every change is recorded in the order's timeline.</span>
        </div>
      )}
      {initial && !edit && <div className="banner info"><i className="ph ph-copy" /><span>Copied from an earlier quotation — check the lines and prices, then submit.</span></div>}

      <section className="fsec compact">
        <h2 className="fsec-ttl"><i className="ph ph-identification-card" />Customer &amp; Order Information</h2>
        <div className="cust-order-row">
          <div className="fg">
            <label htmlFor="customer">Customer Name <span className="req">*</span></label>
            <Combobox
              id="customer"
              name="customer_id"
              value={customerId}
              onChange={pickCustomer}
              placeholder="Search or select customer…"
              required
              requiredMsg="Choose a customer."
              wide
              options={customers.map((x) => ({
                value: String(x.id),
                label: x.name,
                badge: x.code,
                sub: [x.city, x.mobile, x.address].filter(Boolean).join(' · '),
              }))}
            />
          </div>
          <div className="fg">
            <label htmlFor="salesperson">Salesperson <span className="req">*</span></label>
            {salespersons ? (
              <Combobox
                id="salesperson"
                name="salesperson_id"
                value={spId}
                onChange={(val) => setSpId(val)}
                placeholder="Select salesperson…"
                required
                requiredMsg="Choose a salesperson."
                options={salespersons.map((s) => ({
                  value: String(s.id),
                  label: s.full_name,
                }))}
              />
            ) : <div className="ro">{me.full_name}</div>}
          </div>
          <Ro label="Quote date" value={day(edit?.quote_date || today())} />
          <Ro label="Validity" value="15 Days" />
        </div>

        {c ? (
          <div className="cust-meta-strip">
            <div className="cust-meta-item">
              <span className="lbl">Code:</span>
              <span className="val badge b-blue">{c.code || '—'}</span>
            </div>
            {c.type && (
              <div className="cust-meta-item">
                <span className="lbl">Type:</span>
                <span className="val badge b-none">{c.type}</span>
              </div>
            )}
            {c.vat_no && (
              <div className="cust-meta-item">
                <span className="lbl">VAT No:</span>
                <span className="val">{c.vat_no}</span>
              </div>
            )}
            {c.cr_no && (
              <div className="cust-meta-item">
                <span className="lbl">CR No:</span>
                <span className="val">{c.cr_no}</span>
              </div>
            )}
            {(c.mobile || c.email) && (
              <div className="cust-meta-item">
                <span className="lbl">Contact:</span>
                <span className="val">{[c.mobile, c.email].filter(Boolean).join(' · ')}</span>
              </div>
            )}
            {(c.address || c.country) && (
              <div className="cust-meta-item cust-meta-addr">
                <span className="lbl">Address:</span>
                <span className="val">{[c.address, c.country].filter(Boolean).join(', ')}</span>
              </div>
            )}
            {limit != null && (
              <div className="cust-meta-item cust-meta-addr">
                <span className="lbl">Credit:</span>
                <span className={`val${overLimit ? ' red fw6' : ''}`}>
                  SAR {money(used)} with this quote, of a SAR {money(limit)} limit
                  {(exposure[c.id] || 0) > 0 && <span className="muted"> (SAR {money(exposure[c.id])} in open orders)</span>}
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="cust-meta-hint">
            <i className="ph ph-info" /> Select a customer to view code, tax registration, and contact details
          </div>
        )}
      </section>

      <div className="card">
        <div className="tbl-top">
          <h2 className="tbl-ttl">
            <i className="ph ph-package" />
            Line items <span className="badge b-none">{plural(lines.length, 'line')} · {filled} filled</span>
          </h2>
        </div>
        <div className="tbl-wrap">
          <table className="tbl lines">
            <thead>
              <tr>
                <th>#</th><th>Brand</th><th>Color code</th><th>Grade</th><th>Core</th><th>Al skin</th>
                <th>Width</th><th>Length</th><th>Thickness</th><th>Qty (PCS)</th><th>Unit price</th><th className="r">Total M2</th><th className="r">Total (SAR)</th><th><span className="sr-only">Remove</span></th>
              </tr>
            </thead>
            {lines.length === 0 ? (
              <tbody>
                <tr>
                  <td colSpan={14} className="lines-empty">No line items yet. Use <b>Add line</b> below to start.</td>
                </tr>
              </tbody>
            ) : (
              lines.map((l, i) => (
                <tbody key={i} className="qline">
                  <tr>
                    <td className="c-no muted"><span className="line-no"><span className="line-word">Line </span>{i + 1}</span><input type="hidden" name="line_id" value={l.id || ''} /></td>
                    <td className="c-brand" data-label="Brand">{pick(i, 'brand')}</td>
                    <td className="c-color_code" data-label="Color code">{pick(i, 'color_code')}</td>
                    {PICKS.slice(2).map((k) => <td key={k} className={`c-${k}`} data-label={LABELS[k]}>{pick(i, k)}</td>)}
                    <td className="c-qty" data-label="Qty (PCS)"><input name="qty" type="number" inputMode="numeric" min={l.min || 0} step="1" value={l.qty} title={l.min ? `${l.min} PCS already dispatched` : undefined} onChange={(e) => set(i, 'qty', e.target.value)} aria-label={`qty line ${i + 1}`} /></td>
                    <td className="c-price" data-label="Unit price"><input name="price" type="number" inputMode="decimal" min="0" step="0.01" value={l.price} onChange={(e) => set(i, 'price', e.target.value)} aria-label={`price line ${i + 1}`} /></td>
                    <td className="num c-m2" data-label="Total M2">{calc[i]?.m2 ? money(calc[i].m2) : <span className="muted">—</span>}</td>
                    <td className="num fw6 c-total" data-label="Total (SAR)">{calc[i]?.total ? money(calc[i].total) : <span className="muted">—</span>}</td>
                    <td className="c-del">
                      <button type="button" className="btn-link danger" disabled={l.locked} aria-label={`Remove line ${i + 1}`}
                        title={l.locked ? 'On a Delivery Order, so it cannot be removed' : 'Remove line'}
                        onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>
                        <i className="ph ph-trash" />
                      </button>
                    </td>
                  </tr>
                  <tr className="qline-desc">
                    <td colSpan={14}>
                      {calc[i]?.description
                        ? <><span className="doc-ref">{calc[i].description}</span>{calc[i].color_name && <> · {calc[i].color_name}</>} · priced per {calc[i].m2 ? 'M2' : 'piece'}</>
                        : <span className="muted">Pick a brand to build the material description.</span>}
                    </td>
                  </tr>
                </tbody>
              ))
            )}
          </table>
        </div>
        <div className="tbl-actions-bar">
          <div className="tbl-actions-left">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => addRows(1)}>
              <i className="ph ph-plus" /> Add line
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => addRows(5)}>
              <i className="ph ph-plus-circle" /> Add 5 lines
            </button>
          </div>
        </div>
        {PICKS.map((k) => (
          <datalist key={k} id={`opt-${k}`}>
            {k === 'color_code'
              ? Object.entries(colors).map(([code, name]) => <option key={code} value={code}>{name}</option>)
              : (options[k] || []).map((v) => <option key={v} value={v} />)}
          </datalist>
        ))}
        <div className="tbl-foot">
          <div className="fg" style={{ flex: 1, minWidth: 260 }}>
            <label htmlFor="notes">Notes / Remarks</label>
            <textarea id="notes" name="notes" rows={4} defaultValue={initial?.notes} />
          </div>
          <div className="sum">
            <div>Subtotal (SAR) <b>{money(t.subtotal)}</b></div>
            <div><label htmlFor="transport" className="sub" style={{ fontWeight: 400 }}>Transport (SAR)</label>
              <input id="transport" name="transport" type="number" inputMode="decimal" min="0" step="0.01" value={transport} onChange={(e) => setTransport(e.target.value)} />
            </div>
            <div>VAT {vatPct(rate)} (SAR) <b>{money(t.vat)}</b></div>
            <div className="grand">Total (SAR) <b>{money(t.total)}</b></div>
          </div>
        </div>
      </div>

      <div className="row" style={{ justifyContent: 'flex-end' }}>
        {edit && <Link prefetch={false} className="btn btn-ghost btn-lg" href={`/orders?view=${edit.id}`}>Cancel</Link>}
        <button className="btn btn-primary btn-lg" disabled={pending}>
          {pending ? <span className="spin" /> : <i className={`ph ${edit ? 'ph-check' : 'ph-seal-check'}`} />}
          {pending ? 'Saving…' : edit ? 'Save changes' : 'Submit for Approval'}
        </button>
      </div>

      <dialog ref={confirmRef} className="modal small" aria-label={edit ? 'Save order changes' : 'Submit quotation'}
        onMouseDown={(e) => { if (e.target === confirmRef.current) confirmRef.current.close() }}>
        <div className="modal-header">
          <div className="modal-ttl"><i className={`ph ${edit ? 'ph-pencil-simple' : 'ph-seal-check'}`} />{edit ? `Save changes to ${edit.quote_no}?` : 'Submit for approval?'}
            <button type="button" className="btn-link x" onClick={() => confirmRef.current.close()} aria-label="Close" tabIndex={-1}><i className="ph ph-x" /></button>
          </div>
        </div>
        <div className="modal-body">
          <p><b><bdi>{c?.name || 'Customer'}</bdi></b> · {filled} line{filled === 1 ? '' : 's'} · <b>SAR {money(t.total)}</b> incl. VAT.</p>
          {overLimit && <div className="banner warn"><i className="ph ph-warning" /><span>Over the credit limit: SAR {money(used)} of SAR {money(limit)}.</span></div>}
          <p>{edit
            ? 'Documents already issued keep their numbers; printing them again shows the corrected details.'
            : "An approver will see it in Pending Approval. You can't edit it after submitting."}</p>
        </div>
        <div className="modal-foot">
          <button type="button" className="btn btn-ghost" onClick={() => confirmRef.current.close()}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={confirm}><i className={`ph ${edit ? 'ph-check' : 'ph-paper-plane-tilt'}`} />{edit ? 'Save' : 'Submit'}</button>
        </div>
      </dialog>
    </form>
  )
}
