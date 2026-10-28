import Link from 'next/link'
import { storeLabel } from '@/lib/inventory'
import { SHIFTS } from '@/lib/production'
import { day, dmy, money, qty } from '@/lib/tas'
import { PrintButton, RouteDialog } from '../ui'
import Slip from '../inventory/Slip'

export default function PlanDialog({ plan, stock, m2, s, closeHref }) {
  if (!plan) return null
  plan.items?.sort((a, b) => a.id - b.id)

  const totalPlannedPcs = plan.items.reduce((n, i) => n + Number(i.qty || 0), 0)
  const totalProducedPcs = plan.items.reduce((n, i) => n + Number(i.produced_qty || 0), 0)

  const footer = (
    <>
      <PrintButton cls="btn btn-ghost" label="Print / Save PDF" />
      {plan.status === 'OPEN' && (
        <>
          <Link prefetch={false} href={`/inventory/issue/new?plan=${plan.id}`} className="btn btn-ghost">
            <i className="ph ph-arrows-left-right" />Issue RM to this line
          </Link>
          <Link prefetch={false} href={`/production/dpr/new?plan=${plan.id}`} className="btn btn-primary">
            <i className="ph ph-factory" />Enter production
          </Link>
        </>
      )}
      <Link prefetch={false} href={closeHref} className="btn btn-ghost">
        Close
      </Link>
    </>
  )

  return (
    <RouteDialog
      key={plan.id}
      icon="ph-calendar-check"
      title={
        <>
          Plan {plan.plan_no}{' '}
          <span className={`badge ${plan.status === 'DONE' ? 'b-ok' : 'b-info'}`}>
            {plan.status === 'DONE' ? 'Done' : 'Open'}
          </span>
        </>
      }
      footer={footer}
      closeHref={closeHref}
    >
      <div className="no-print">
        {/* ── Plan Header Details ── */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="tbl-top">
            <h2 className="tbl-ttl"><i className="ph ph-info" />Plan Details</h2>
          </div>
          <div className="fgrid-4" style={{ padding: '0 16px 16px' }}>
            <div>
              <span className="muted text-xs">Plan Date</span>
              <div className="fw6">{day(plan.plan_date)}</div>
            </div>
            <div>
              <span className="muted text-xs">Shift</span>
              <div className="fw6">{SHIFTS[plan.shift]}</div>
            </div>
            <div>
              <span className="muted text-xs">Line</span>
              <div className="fw6">{storeLabel(plan.line)}</div>
            </div>
            <div>
              <span className="muted text-xs">Created By</span>
              <div className="fw6">{plan.by_name || '—'}</div>
            </div>
          </div>
          {plan.notes && (
            <div style={{ padding: '0 16px 14px', borderTop: '1px solid var(--border)' }}>
              <span className="muted text-xs" style={{ display: 'block', marginTop: 10 }}>Notes</span>
              <span className="text-sm">{plan.notes}</span>
            </div>
          )}
        </div>

        {/* ── Planned Items Table ── */}
        <div className="card">
          <div className="tbl-top">
            <h2 className="tbl-ttl">
              <i className="ph ph-stack" />Planned Items <span className="badge b-none">{plan.items?.length ?? 0}</span>
            </h2>
          </div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Item (product + size)</th>
                  <th>Color</th>
                  <th className="r">Planned pcs</th>
                  <th className="r">Planned M2</th>
                  <th className="r">Produced pcs</th>
                  <th>Progress</th>
                </tr>
              </thead>
              <tbody>
                {plan.items.map((i) => {
                  const pct = i.qty > 0 ? Math.min(100, Math.round((Number(i.produced_qty || 0) / Number(i.qty)) * 100)) : 0
                  const isDone = Number(i.produced_qty) >= Number(i.qty) && Number(i.qty) > 0
                  return (
                    <tr key={i.id}>
                      <td data-label="Item"><span className="mat-name">{i.f?.code}</span></td>
                      <td data-label="Color">{i.f?.color_name || <span className="muted">—</span>}</td>
                      <td className="num fw6" data-label="Planned pcs">{qty(i.qty)}</td>
                      <td className="num" data-label="Planned M2">{money(i.qty * (i.f?.m2_per_pc || 0))}</td>
                      <td className="num fw6" data-label="Produced pcs">{qty(i.produced_qty)}</td>
                      <td data-label="Progress">
                        {isDone ? (
                          <span className="badge b-ok">Done</span>
                        ) : i.produced_qty > 0 ? (
                          <span className="badge b-warn">{pct}%</span>
                        ) : (
                          <span className="badge b-info">Scheduled</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr>
                  <th className="fw7">Total</th>
                  <th></th>
                  <th className="num fw7">{qty(totalPlannedPcs)}</th>
                  <th className="num fw7">{money(m2)}</th>
                  <th className="num fw7">{qty(totalProducedPcs)}</th>
                  <th></th>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* ── RM in Plant Today ── */}
        <div className="card" style={{ marginTop: 16 }}>
          <div className="tbl-top">
            <h2 className="tbl-ttl"><i className="ph ph-warehouse" />RM in plant {plan.line?.plant_code} today</h2>
            <span className="muted text-sm">{money(m2)} M2 planned. RM per M2 will be calculated here once a BOM is added.</span>
          </div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Store</th><th>Material</th><th className="r">In stock</th></tr></thead>
              <tbody>
                {(stock || []).map((r) => (
                  <tr key={`${r.store_id}-${r.material_id}`}>
                    <td data-label="Store">
                      {r.store}
                      {r.store_id === plan.line?.id && <span className="badge b-teal" style={{ marginLeft: 6 }}>this line</span>}
                    </td>
                    <td data-label="Material">
                      <span className="mat-name">{r.name}</span>
                      <span className="mat-sub">{r.code}</span>
                    </td>
                    <td className="num fw6" data-label="In stock">{qty(r.closing)} {r.uom}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!stock?.length && (
              <div className="empty">
                <i className="ph ph-warehouse" />
                <h3>No RM in this plant</h3>
                <p>Receive goods (GRN) or load the RM opening stock first.</p>
              </div>
            )}
          </div>
          {(plan.issues?.length > 0 || plan.dprs?.length > 0) && (
            <div className="tbl-foot">
              <div className="row">
                {plan.issues.map((t) => (
                  <Link prefetch={false} key={`i${t.id}`} href={`/inventory/issue?view=${t.id}`} className="chip-link">
                    {t.doc_no} · RM issued
                  </Link>
                ))}
                {plan.dprs.map((d) => (
                  <Link prefetch={false} key={`d${d.id}`} href={`/production/dpr?view=${d.id}`} className="chip-link">
                    {d.dpr_no} · production
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Printable Slip: visible only when printed */}
      <div className="print-only">
        <Slip
          s={s}
          fno="F.NO:-TAS/PRD/01"
          title="PRODUCTION PLAN"
          meta={[
            ['DATE', dmy(plan.plan_date)],
            ['PLAN NO.', plan.plan_no],
            ['SHIFT', SHIFTS[plan.shift]],
            ['LINE', storeLabel(plan.line)],
          ]}
          heads={['ITEM (PRODUCT + SIZE)', 'COLOUR', 'PLANNED PCS', 'M2', 'PRODUCED PCS']}
          rows={plan.items.map((i) => [
            i.f?.code,
            i.f?.color_name || '',
            qty(i.qty),
            money(i.qty * (i.f?.m2_per_pc || 0)),
            qty(i.produced_qty),
          ])}
          foot={[
            'TOTAL',
            '',
            qty(totalPlannedPcs),
            money(m2),
            qty(totalProducedPcs),
          ]}
          notes={plan.notes}
          signs={['Planned By', 'Line Incharge']}
        />
      </div>
    </RouteDialog>
  )
}
