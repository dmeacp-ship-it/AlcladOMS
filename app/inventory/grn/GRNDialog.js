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
      <PrintButton cls="btn btn-primary" />
      {grn.po && (
        <Link prefetch={false} href={`/inventory/po?view=${grn.po.id}`} className="btn btn-ghost">
          <i className="ph ph-shopping-cart" />View {grn.po.po_no}
        </Link>
      )}
    </>
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
      {!qc && (
        <div style={{ marginBottom: 20 }}>
          <ActionForm
            action={qcGRN}
            className="card no-print"
            submit={{ label: 'Save check — put into stock', icon: 'ph-seal-check', cls: 'btn btn-success' }}
          >
            <input type="hidden" name="id" value={grn.id} />
            <div className="tbl-top">
              <h2 className="tbl-ttl"><i className="ph ph-seal-check" />Check the goods</h2>
              <span className="muted text-sm">
                Enter what failed inspection; the rest goes into {grn.store?.name}. Rejected quantity goes back on the PO as pending.
              </span>
            </div>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Material</th>
                    <th className="r">Received</th>
                    <th>Rejected</th>
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
                        {qty(i.qty)} {i.m?.uom}
                      </td>
                      <td data-label="Rejected">
                        <input type="hidden" name="item" value={i.id} />
                        <input
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
                        <input name={`rem_${i.id}`} placeholder="Dent, wrong colour, thickness out…" aria-label={`Reason ${i.m?.name}`} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ActionForm>
        </div>
      )}

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
    </RouteDialog>
  )
}
