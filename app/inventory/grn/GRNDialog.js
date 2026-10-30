import Link from 'next/link'
import { day, dmy, qty } from '@/lib/tas'
import { PrintButton, RouteDialog } from '../../ui'
import { qcGRN } from '../actions'
import ActionForm from '../ActionForm'
import Slip from '../Slip'

export default function GRNDialog({ grn, s, me, closeHref }) {
  if (!grn) return null
  grn.items?.sort((a, b) => a.id - b.id)
  const qc = grn.status === 'DONE'

  const footer = (
    <>
      <PrintButton cls="btn btn-ghost" />
      {grn.po && (
        <Link prefetch={false} href={`/inventory/po?view=${grn.po.id}`} className="btn btn-ghost">
          <i className="ph ph-shopping-cart" />View {grn.po.po_no}
        </Link>
      )}
    </>
  )

  const slip = (
    <Slip
      s={s}
      fno="F.NO:-TAS/STR/01"
      title="GOODS RECEIPT NOTE"
      meta={[
        ['DATE', dmy(grn.grn_date)],
        ['GRN NO.', grn.grn_no],
        ['PO NO.', grn.po?.po_no],
        ['INVOICE NO.', grn.invoice_no],
      ]}
      party={[
        ['RECEIVED FROM', [grn.po?.vendor_name, grn.po?.vendor?.address, grn.po?.vendor?.vat_no && `VAT NO:- ${grn.po.vendor.vat_no}`]],
        ['RECEIVED INTO', [grn.store?.name, `Plant ${grn.store?.plant_code}`, `Received by ${grn.by_name}`]],
      ]}
      heads={['MATERIAL', 'CODE', 'UOM', 'RECEIVED', 'ACCEPTED', 'REJECTED']}
      rows={grn.items.map((i) => [
        i.qc_remarks ? `${i.m?.name} (${i.qc_remarks})` : i.m?.name,
        i.m?.code,
        i.m?.uom,
        qty(i.qty),
        qc ? qty(i.accepted_qty) : 'QC pending',
        qc ? qty(i.rejected_qty) : '',
      ])}
      notes={grn.notes}
      signs={['Store Incharge', `QC Inspector${grn.qc_by ? ` (${grn.qc_by})` : ''}`]}
    />
  )

  return (
    <RouteDialog
      key={grn.id}
      icon="ph-seal-check"
      title={
        <>
          GRN {grn.grn_no}{' '}
          <span className={`badge ${qc ? 'b-ok' : 'b-warn'}`}>
            {qc ? `Checked · ${grn.qc_by || 'QC'}` : 'Waiting to be checked'}
          </span>
        </>
      }
      footer={footer}
      closeHref={closeHref}
    >
      <div className="no-print">
        {/* ── Receipt Details Summary ── */}
        <div className="card mb-16">
          <div className="tbl-top">
            <h2 className="tbl-ttl"><i className="ph ph-info" />Receipt Details</h2>
          </div>
          <div className="fgrid-4" style={{ padding: '0 16px 16px' }}>
            <div>
              <span className="muted text-xs">Receipt Date</span>
              <div className="fw6">{day(grn.grn_date)}</div>
            </div>
            <div>
              <span className="muted text-xs">PO Number</span>
              <div className="fw6">
                {grn.po ? (
                  <Link prefetch={false} href={`/inventory/po?view=${grn.po.id}`} className="qno">
                    {grn.po.po_no}
                  </Link>
                ) : '—'}
              </div>
            </div>
            <div>
              <span className="muted text-xs">Vendor</span>
              <div className="fw6">{grn.po?.vendor_name || '—'}</div>
            </div>
            <div>
              <span className="muted text-xs">Store &amp; Plant</span>
              <div className="fw6">{grn.store?.name} <span className="muted text-xs">({grn.store?.plant_code})</span></div>
            </div>
            {grn.invoice_no && (
              <div>
                <span className="muted text-xs">Invoice No</span>
                <div className="fw6">{grn.invoice_no}</div>
              </div>
            )}
            <div>
              <span className="muted text-xs">Received By</span>
              <div className="fw6">{grn.by_name || '—'}</div>
            </div>
            {qc && grn.qc_by && (
              <div>
                <span className="muted text-xs">QC Checked By</span>
                <div className="fw6">{grn.qc_by} {grn.qc_date ? `· ${day(grn.qc_date)}` : ''}</div>
              </div>
            )}
          </div>
          {grn.notes && (
            <div style={{ padding: '0 16px 14px', borderTop: '1px solid var(--border)' }}>
              <span className="muted text-xs d-block mt-10">Notes</span>
              <span className="text-sm">{grn.notes}</span>
            </div>
          )}
        </div>

        {/* ── Inspection Form: only when waiting to be checked ── */}
        {!qc && (
          <ActionForm
            action={qcGRN}
            className="card"
            submit={{ label: 'Save check — put into stock', icon: 'ph-seal-check', cls: 'btn btn-success' }}
          >
            <input type="hidden" name="id" value={grn.id} />
            <div className="tbl-top">
              <div>
                <h2 className="tbl-ttl"><i className="ph ph-seal-check" />Check the goods</h2>
                <span className="muted text-sm d-block mt-2">
                  Enter what failed inspection; the rest goes into {grn.store?.name}. Rejected quantity goes back on the PO as pending.
                </span>
              </div>
            </div>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th style={{ width: '38%' }}>Material</th>
                    <th className="r" style={{ width: '16%' }}>Received</th>
                    <th className="r" style={{ width: '18%' }}>Rejected</th>
                    <th>Reason (if rejected)</th>
                  </tr>
                </thead>
                <tbody>
                  {grn.items.map((i) => (
                    <tr key={i.id}>
                      <td data-label="Material">
                        <span className="mat-name">{i.m?.name}</span>
                        <span className="mat-sub">{i.m?.code}</span>
                      </td>
                      <td className="num fw6" data-label="Received">
                        {qty(i.qty)} <span className="muted text-xs">{i.m?.uom}</span>
                      </td>
                      <td className="r" data-label="Rejected">
                        <input type="hidden" name="item" value={i.id} />
                        <input
                          className="qty"
                          style={{ width: 110, textAlign: 'right' }}
                          name={`rej_${i.id}`}
                          type="number"
                          inputMode="decimal"
                          step="any"
                          min={0}
                          max={i.qty}
                          defaultValue={0}
                          aria-label={`Rejected ${i.m?.name}`}
                        />
                      </td>
                      <td data-label="Reason">
                        <input
                          name={`rem_${i.id}`}
                          placeholder="Dent, wrong colour, thickness out…"
                          aria-label={`Reason ${i.m?.name}`}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ActionForm>
        )}

        {/* ── Checked Items Summary Table: when QC is done ── */}
        {qc && (
          <div className="card">
            <div className="tbl-top">
              <h2 className="tbl-ttl">
                <i className="ph ph-package" />Received Items <span className="badge b-none">{grn.items.length}</span>
              </h2>
            </div>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Material</th>
                    <th>Code</th>
                    <th>UoM</th>
                    <th className="r">Received</th>
                    <th className="r">Accepted</th>
                    <th className="r">Rejected</th>
                    <th>QC Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {grn.items.map((i) => (
                    <tr key={i.id}>
                      <td data-label="Material"><span className="mat-name">{i.m?.name}</span></td>
                      <td data-label="Code">{i.m?.code}</td>
                      <td data-label="UoM">{i.m?.uom}</td>
                      <td className="num" data-label="Received">{qty(i.qty)}</td>
                      <td className="num fw6" data-label="Accepted" style={{ color: 'var(--btn-ok)' }}>{qty(i.accepted_qty)}</td>
                      <td className={`num${i.rejected_qty > 0 ? ' red fw6' : ' muted'}`} data-label="Rejected">
                        {i.rejected_qty > 0 ? qty(i.rejected_qty) : 0}
                      </td>
                      <td data-label="QC Remarks">{i.qc_remarks || <span className="muted">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Document Preview (folded disclosure) ── */}
        <details className="disclosure mt-16">
          <summary className="btn btn-ghost btn-sm d-iflex ai-c gap-8">
            <i className="ph ph-file-text" />Preview Goods Receipt Note (Print Document)
            <i className="ph ph-caret-down disc-caret" />
          </summary>
          <div className="mt-14">
            {slip}
          </div>
        </details>
      </div>

      {/* ── Printable Slip: visible only when printed ── */}
      <div className="print-only">
        {slip}
      </div>
    </RouteDialog>
  )
}
