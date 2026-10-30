'use client'
import { startTransition, useActionState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { money, qty, today } from '@/lib/tas'
import { Combobox, LinkBusy, RouteDialog, UnsavedGuard } from '../ui'
import { createPlan } from './actions'
import PlanBufferSection from './new/PlanBufferSection'

const SHIFTS = { DAY: 'Day', NIGHT: 'Night' }
const storeLabel = (s) => (s ? [s.name, s.plant_code && `(${s.plant_code})`].filter(Boolean).join(' ') : '')

export default function NewPlanDialog({
  wip = [],
  allOrderRows = [],
  rows = [],
  showAll = false,
  toMake = 0,
  quotes = {},
  catalogItems = [],
  options = {},
  shortagesHref = '/production?new=1',
  allHref = '/production?new=1&show=all',
  closeHref,
}) {
  const [state, formAction, pending] = useActionState(createPlan, null)
  const errRef = useRef(null)
  useEffect(() => {
    if (state?.error) errRef.current?.focus()
  }, [state])

  const handleSubmit = (e) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(() => formAction(fd))
  }

  const hasShortages = allOrderRows.some((p) => p.short > 0)
  const displayRows = rows?.length ? rows : ((showAll || !hasShortages) ? allOrderRows : allOrderRows.filter((p) => p.short > 0))

  const footer = (
    <button
      type="submit"
      form="plan-form"
      className="btn btn-primary"
      disabled={pending}
    >
      {pending ? <span className="spin" /> : <i className="ph ph-calendar-check" />}
      {pending ? 'Creating…' : 'Create production plan'}
    </button>
  )

  return (
    <RouteDialog
      icon="ph-calendar-check"
      title="New Production Plan"
      footer={footer}
      closeHref={closeHref}
    >
      <form id="plan-form" onSubmit={handleSubmit}>
        <UnsavedGuard />

        {state?.error && (
          <div ref={errRef} tabIndex={-1} role="alert" className="banner error shake mb-14">
            <i className="ph ph-warning-circle" />
            <span><b>Not saved.</b> {state.error}</span>
          </div>
        )}

        <section className="fsec compact">
          <h2 className="fsec-ttl"><i className="ph ph-calendar-check" />Plan for</h2>
          <div className="fgrid-4">
            <div className="fg">
              <label htmlFor="line">Production line <span className="req">*</span></label>
              <Combobox
                id="line"
                name="line"
                defaultValue={wip.length === 1 ? String(wip[0].id) : ''}
                placeholder="Select line…"
                required
                requiredMsg="Choose a production line."
                options={wip.map((x) => ({
                  value: String(x.id),
                  label: storeLabel(x),
                  badge: x.type,
                }))}
              />
            </div>
            <div className="fg">
              <label htmlFor="date">Date</label>
              <input id="date" name="date" type="date" defaultValue={today()} required />
            </div>
            <div className="fg">
              <label htmlFor="shift">Shift</label>
              <Combobox
                id="shift"
                name="shift"
                defaultValue="DAY"
                required
                options={Object.entries(SHIFTS).map(([k, l]) => ({ value: k, label: l }))}
              />
            </div>
            <div className="fg">
              <label htmlFor="notes">Notes</label>
              <input id="notes" name="notes" placeholder="Notes…" />
            </div>
          </div>
          {!wip.length && (
            <p className="red text-sm mt-10">
              Add the production lines as stores of type WIP under Settings → Stores.
            </p>
          )}
        </section>

        <div className="card mt-16">
          <div className="tbl-top">
            <h2 className="tbl-ttl">
              <i className="ph ph-list-checks" />What open orders still need{' '}
              <span className="badge b-none">{displayRows.length}</span>
              {toMake > 0 && <span className="badge b-bad">{qty(toMake)} pcs still to make</span>}
            </h2>
            <div className="tbl-filters">
              <nav className="tabs mb-0" aria-label="Shortages filter">
                <Link
                  prefetch={false}
                  href={shortagesHref}
                  scroll={false}
                  className={`tab${!showAll && hasShortages ? ' on' : ''}`}
                >
                  <LinkBusy />Shortages
                </Link>
                <Link
                  prefetch={false}
                  href={allHref}
                  scroll={false}
                  className={`tab${showAll || !hasShortages ? ' on' : ''}`}
                >
                  <LinkBusy />All
                </Link>
              </nav>
            </div>
          </div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Item (product + size)</th>
                  <th>Orders</th>
                  <th className="r">Orders need</th>
                  <th className="r">In stock</th>
                  <th className="r">Already planned</th>
                  <th className="r">Being checked</th>
                  <th className="r">Still to make</th>
                  <th>Make in this plan (pcs)</th>
                </tr>
              </thead>
              <tbody>
                {displayRows.map((r) => (
                  <tr key={r.fg_item_id}>
                    <td data-label="Item">
                      <span className="mat-name">{r.f?.code}</span>
                      <span className="mat-sub">
                        {[r.f?.color_name, `${money(r.f?.m2_per_pc)} M2 / pc`].filter(Boolean).join(' · ')}
                      </span>
                    </td>
                    <td className="text-sm" data-label="Orders">
                      {[...(quotes[r.fg_item_id] || [])].join(', ') || <span className="muted">—</span>}
                    </td>
                    <td className="num" data-label="Orders need">{qty(r.need)}</td>
                    <td className="num" data-label="In stock">{qty(Math.max(0, r.free))}</td>
                    <td className="num" data-label="Already planned">
                      {r.planned ? qty(r.planned) : <span className="muted">0</span>}
                    </td>
                    <td className="num" data-label="Being checked">
                      {r.in_qc ? qty(r.in_qc) : <span className="muted">0</span>}
                    </td>
                    <td className={`num fw6${r.short ? ' red' : ''}`} data-label="Still to make">
                      {qty(r.short)}
                      <span className="mat-sub">{money(r.short * (r.f?.m2_per_pc || 0))} M2</span>
                    </td>
                    <td data-label="Make in this plan">
                      <input type="hidden" name="item" value={r.fg_item_id} />
                      <input
                        name={`qty_${r.fg_item_id}`}
                        type="number"
                        inputMode="numeric"
                        min={0}
                        step={1}
                        defaultValue={r.short || ''}
                        aria-label={`Pieces to plan, ${r.f?.code}`}
                        style={{ width: 100 }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!displayRows.length && (
              <div className="empty">
                <i className="ph ph-check-circle" />
                <h3>No order shortages</h3>
                <p>Every open order is covered by stock, a plan or pieces being checked. You can plan buffer stock below.</p>
              </div>
            )}
          </div>
        </div>

        <PlanBufferSection catalogItems={catalogItems} options={options} />
      </form>
    </RouteDialog>
  )
}
