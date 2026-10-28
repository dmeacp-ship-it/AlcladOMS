import Link from 'next/link'
import { storeLabel } from '@/lib/inventory'
import { SHIFTS } from '@/lib/production'
import { day, dmy, money, qty } from '@/lib/tas'
import { PrintButton, RouteDialog } from '../../ui'
import Slip from '../../inventory/Slip'

export default function DprDialog({ dpr, used, s, closeHref }) {
  if (!dpr) return null
  dpr.items?.sort((a, b) => a.id - b.id)
  const open = dpr.items?.filter((i) => !i.qc_at && i.good_qty > 0).length

  const totalGoodPcs = dpr.items.reduce((n, i) => n + Number(i.good_qty || 0), 0)
  const totalGoodM2 = dpr.items.reduce((n, i) => n + (i.good_qty || 0) * (i.f?.m2_per_pc || 0), 0)
  const totalRejected = dpr.items.reduce((n, i) => n + Number(i.rejected_qty || 0), 0)

  const footer = (
    <>
      <PrintButton cls="btn btn-ghost" label="Print / Save PDF" />
      {open > 0 && (
        <Link prefetch={false} href="/production/qc" className="btn btn-primary">
          <i className="ph ph-seal-check" />Check these pieces
        </Link>
      )}
      {dpr.plan && (
        <Link prefetch={false} href={`/production?view=${dpr.plan.id}`} className="btn btn-ghost">
          <i className="ph ph-calendar-check" />View {dpr.plan.plan_no}
        </Link>
      )}
      <Link prefetch={false} href={closeHref} className="btn btn-ghost">
        Close
      </Link>
    </>
  )

  return (
    <RouteDialog
      key={dpr.id}
      icon="ph-factory"
      title={
        <>
          DPR {dpr.dpr_no}{' '}
          <span className={`badge ${open ? 'b-warn' : 'b-ok'}`}>
            {open ? `${open} waiting check` : 'Checked'}
          </span>
        </>
      }
      footer={footer}
      closeHref={closeHref}
    >
      <div className="no-print">
        {/* ── Metadata / Summary Section ── */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="tbl-top">
            <h2 className="tbl-ttl"><i className="ph ph-info" />Shift Details</h2>
          </div>
          <div className="fgrid-4" style={{ padding: '0 16px 16px' }}>
            <div>
              <span className="muted text-xs">Production Date</span>
              <div className="fw6">{day(dpr.prod_date)}</div>
            </div>
            <div>
              <span className="muted text-xs">Shift</span>
              <div className="fw6">{SHIFTS[dpr.shift]}</div>
            </div>
            <div>
              <span className="muted text-xs">Line</span>
              <div className="fw6">{storeLabel(dpr.line)}</div>
            </div>
            <div>
              <span className="muted text-xs">Operator / Entered By</span>
              <div className="fw6">{dpr.operator || '—'} {dpr.by_name ? `(${dpr.by_name})` : ''}</div>
            </div>
          </div>
          {dpr.notes && (
            <div style={{ padding: '0 16px 14px', borderTop: '1px solid var(--border)' }}>
              <span className="muted text-xs" style={{ display: 'block', marginTop: 10 }}>Notes</span>
              <span className="text-sm">{dpr.notes}</span>
            </div>
          )}
        </div>

        {/* ── Table: Pieces Produced ── */}
        <div className="card">
          <div className="tbl-top">
            <h2 className="tbl-ttl">
              <i className="ph ph-stack" />Pieces Produced <span className="badge b-none">{dpr.items?.length ?? 0}</span>
            </h2>
          </div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Item (product + size)</th>
                  <th className="r">Good pcs</th>
                  <th className="r">Good M2</th>
                  <th className="r">Rejected</th>
                  <th>Reject reason</th>
                  <th>QC Status</th>
                </tr>
              </thead>
              <tbody>
                {dpr.items.map((i) => {
                  const isChecked = Boolean(i.qc_at)
                  return (
                    <tr key={i.id}>
                      <td data-label="Item">
                        <span className="mat-name">{i.f?.code}</span>
                        {i.f?.color_name && <span className="mat-sub">{i.f.color_name}</span>}
                      </td>
                      <td className="num fw6" data-label="Good pcs">{qty(i.good_qty)}</td>
                      <td className="num" data-label="Good M2">{money(i.good_qty * (i.f?.m2_per_pc || 0))}</td>
                      <td className={`num${i.rejected_qty ? ' red fw6' : ''}`} data-label="Rejected">
                        {i.rejected_qty ? qty(i.rejected_qty) : <span className="muted">0</span>}
                      </td>
                      <td data-label="Reject reason">
                        {i.reject_reason || <span className="muted">—</span>}
                      </td>
                      <td data-label="QC Status">
                        {isChecked ? (
                          <span className="badge b-ok">{qty(i.qc_pass)} Pass</span>
                        ) : i.good_qty > 0 ? (
                          <span className="badge b-warn">QC pending</span>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr>
                  <th className="fw7">Total</th>
                  <th className="num fw7">{qty(totalGoodPcs)}</th>
                  <th className="num fw7">{money(totalGoodM2)}</th>
                  <th className="num fw7 red">{totalRejected ? qty(totalRejected) : 0}</th>
                  <th colSpan={2}></th>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* ── Table: Raw Material Used on Line ── */}
        {used?.length > 0 && (
          <div className="card" style={{ marginTop: 16 }}>
            <div className="tbl-top">
              <h2 className="tbl-ttl">
                <i className="ph ph-package" />Raw Material Used on Line <span className="badge b-none">{used.length}</span>
              </h2>
            </div>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Material</th>
                    <th>Code</th>
                    <th className="r">Quantity Used</th>
                  </tr>
                </thead>
                <tbody>
                  {used.map((u, idx) => (
                    <tr key={idx}>
                      <td data-label="Material">
                        <span className="mat-name">{u.m?.name}</span>
                      </td>
                      <td data-label="Code">{u.m?.code}</td>
                      <td className="num fw6" data-label="Quantity Used">
                        {qty(Math.abs(u.qty))} {u.m?.uom}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Printable Slip: visible only when printed */}
      <div className="print-only">
        <Slip
          s={s}
          fno="F.NO:-TAS/PRD/02"
          title="DAILY PRODUCTION REPORT"
          meta={[
            ['DATE', dmy(dpr.prod_date)],
            ['DPR NO.', dpr.dpr_no],
            ['SHIFT', SHIFTS[dpr.shift]],
            ['LINE', storeLabel(dpr.line)],
          ]}
          party={[
            ['OPERATOR', [dpr.operator, `Entered by ${dpr.by_name}`]],
            ['RM USED', (used || []).map((u) => `${u.m?.name} (${u.m?.code}): ${qty(-u.qty)} ${u.m?.uom}`)],
          ]}
          heads={['ITEM (PRODUCT + SIZE)', 'GOOD PCS', 'GOOD M2', 'REJECTED', 'QC PASS / B / REJ']}
          rows={dpr.items.map((i) => [
            `${i.f?.code}${i.reject_reason ? ` (rejected: ${i.reject_reason})` : ''}`,
            qty(i.good_qty),
            money(i.good_qty * (i.f?.m2_per_pc || 0)),
            qty(i.rejected_qty),
            i.qc_at ? `${qty(i.qc_pass)} / ${qty(i.qc_b)} / ${qty(i.qc_reject)}` : (i.good_qty > 0 ? 'QC pending' : '—'),
          ])}
          foot={[
            'TOTAL',
            qty(totalGoodPcs),
            money(totalGoodM2),
            qty(totalRejected),
            '',
          ]}
          notes={dpr.notes}
          signs={['Shift Incharge', 'Production Manager']}
        />
      </div>
    </RouteDialog>
  )
}
