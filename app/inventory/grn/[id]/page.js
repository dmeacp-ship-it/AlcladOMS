import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db, requireRole } from '@/lib/server'
import { getSettings } from '@/lib/settings'
import { dmy, qty } from '@/lib/tas'
import { PrintButton } from '../../../ui'
import { qcGRN } from '../../actions'
import ActionForm from '../../ActionForm'
import Slip from '../../Slip'

export async function generateMetadata({ params }) {
  const { data } = await db().from('grns').select('grn_no').eq('id', (await params).id).maybeSingle()
  return { title: { absolute: data?.grn_no || 'GRN' } }
}

// One GRN: the printable slip and, until QC is done, the incoming QC form (accepted quantity goes into stock).
export default async function GRN({ params }) {
  const { id } = await params
  if (!/^\d+$/.test(id)) notFound()
  const [, { data: g }, s] = await Promise.all([
    requireRole('manager'),
    db().from('grns').select('*, po:purchase_orders(id, po_no, vendor_name, vendor:vendors(address, vat_no)), store:stores(name, plant_code), items:grn_items(*, m:materials(code, name, uom))')
      .eq('id', id).maybeSingle(),
    getSettings(),
  ])
  if (!g) notFound()
  g.items.sort((a, b) => a.id - b.id)
  const qc = g.status === 'DONE'

  return (
    <>
      <div className="page-head no-print">
        <Link prefetch={false} href="/inventory/grn" className="btn btn-ghost btn-sm"><i className="ph ph-arrow-left" />GRN & QC</Link>
        <Link prefetch={false} href={`/inventory/po/${g.po.id}`} className="chip-link">{g.po.po_no}</Link>
        {qc ? <span className="badge b-ok">QC done · {g.qc_by}</span> : <span className="badge b-warn">Waiting for QC</span>}
        <div className="acts"><PrintButton /></div>
      </div>

      {!qc && (
        <div style={{ marginBottom: 20 }}><ActionForm action={qcGRN} className="card no-print" submit={{ label: 'Save QC and put into stock', icon: 'ph-seal-check', cls: 'btn btn-success' }}>
          <input type="hidden" name="id" value={g.id} />
          <div className="tbl-top">
            <h2 className="tbl-ttl"><i className="ph ph-seal-check" />Incoming QC</h2>
            <span className="muted text-sm">Enter what failed inspection; the rest goes into {g.store?.name}. Rejected quantity goes back on the PO as pending.</span>
          </div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Material</th><th className="r">Received</th><th>Rejected</th><th>Reason (if rejected)</th></tr></thead>
              <tbody>
                {g.items.map((i) => (
                  <tr key={i.id}>
                    <td data-label="Material"><span className="mat-name">{i.m.name}</span><span className="mat-sub">{i.m.code}</span></td>
                    <td className="num fw6" data-label="Received">{qty(i.qty)} {i.m.uom}</td>
                    <td data-label="Rejected">
                      <input type="hidden" name="item" value={i.id} />
                      <input name={`rej_${i.id}`} type="number" inputMode="decimal" step="any" min={0} max={i.qty} defaultValue={0} aria-label={`Rejected ${i.m.name}`} />
                    </td>
                    <td data-label="Reason"><input name={`rem_${i.id}`} placeholder="Dent, wrong colour, thickness out…" aria-label={`Reason ${i.m.name}`} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ActionForm></div>
      )}

      <Slip
        s={s} fno="F.NO:-TAS/STR/01" title="GOODS RECEIPT NOTE"
        meta={[['DATE', dmy(g.grn_date)], ['GRN NO.', g.grn_no], ['PO NO.', g.po.po_no], ['INVOICE NO.', g.invoice_no]]}
        party={[
          ['RECEIVED FROM', [g.po.vendor_name, g.po.vendor?.address, g.po.vendor?.vat_no && `VAT NO:- ${g.po.vendor.vat_no}`]],
          ['RECEIVED INTO', [g.store?.name, `Plant ${g.store?.plant_code}`, `Received by ${g.by_name}`]],
        ]}
        heads={['MATERIAL', 'CODE', 'UOM', 'RECEIVED', 'ACCEPTED', 'REJECTED']}
        rows={g.items.map((i) => [
          i.qc_remarks ? `${i.m.name} (${i.qc_remarks})` : i.m.name, i.m.code, i.m.uom, qty(i.qty),
          qc ? qty(i.accepted_qty) : 'QC pending', qc ? qty(i.rejected_qty) : '',
        ])}
        notes={g.notes}
        signs={['Store Incharge', `QC Inspector${g.qc_by ? ` (${g.qc_by})` : ''}`]}
      />
    </>
  )
}
