import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db, requireRole } from '@/lib/server'
import { getSettings } from '@/lib/settings'
import { PO_STATUS, day, dmy, money, qty } from '@/lib/tas'
import { Modal, ModalFoot, PrintButton, Submit } from '../../../ui'
import { approvePO, closePO, rejectPO } from '../../actions'
import Slip from '../../Slip'

export async function generateMetadata({ params }) {
  const { data } = await db().from('purchase_orders').select('po_no').eq('id', (await params).id).maybeSingle()
  return { title: { absolute: data?.po_no || 'Purchase Order' } }
}

// One PO: the printable slip, what has arrived against it, and its approve / reject / receive / close actions.
export default async function PO({ params }) {
  const { id } = await params
  if (!/^\d+$/.test(id)) notFound()
  const [me, { data: po }, s] = await Promise.all([
    requireRole('manager'),
    db().from('purchase_orders')
      .select('*, plant:plants(name, address), vendor:vendors(*), items:po_items(*, m:materials(code, name, uom)), grns(id, grn_no, grn_date, status, invoice_no)')
      .eq('id', id).maybeSingle(),
    getSettings(),
  ])
  if (!po) notFound()
  po.items.sort((a, b) => a.line_no - b.line_no)
  const [label, cls] = PO_STATUS[po.status]
  const total = po.items.reduce((n, i) => n + i.qty * i.rate, 0)
  const reason = (action, title, btn, cls2) => (
    <Modal title={title} icon="ph-warning-circle" label={btn} btnIcon={cls2 === 'btn-danger' ? 'ph-x-circle' : 'ph-prohibit'} btnClass="btn btn-ghost btn-sm" size="small">
      <form action={action}>
        <input type="hidden" name="id" value={po.id} />
        <div className="modal-body">
          <div className="fg"><label htmlFor={`r-${po.id}-${cls2}`}>Reason <span className="req">*</span></label><textarea id={`r-${po.id}-${cls2}`} name="reason" rows={3} required /></div>
        </div>
        <ModalFoot label={btn} icon="ph-check" cls={cls2} />
      </form>
    </Modal>
  )

  return (
    <>
      <div className="page-head no-print">
        <Link prefetch={false} href="/inventory/po" className="btn btn-ghost btn-sm"><i className="ph ph-arrow-left" />Purchase Orders</Link>
        <span className={`badge ${cls}`}>{label}</span>
        {po.reason && <span className="muted text-sm">{po.reason}{po.action_by && ` · ${po.action_by}`}</span>}
        <div className="acts">
          {po.status === 'PENDING' && me.role === 'admin' && (
            <>
              <form action={approvePO}><input type="hidden" name="id" value={po.id} /><Submit label="Approve" icon="ph-check" cls="btn btn-success btn-sm" /></form>
              {reason(rejectPO, `Reject ${po.po_no}?`, 'Reject', 'btn-danger')}
            </>
          )}
          {po.status === 'PENDING' && me.role !== 'admin' && <span className="muted text-sm">Waiting for an admin to approve</span>}
          {po.status === 'APPROVED' && (
            <>
              <Link prefetch={false} href={`/inventory/grn/new?po=${po.id}`} className="btn btn-primary btn-sm"><i className="ph ph-truck" />Receive goods (GRN)</Link>
              {reason(closePO, `Close ${po.po_no}?`, 'Close PO', 'btn-primary')}
            </>
          )}
          <PrintButton />
        </div>
      </div>

      <Slip
        s={s} fno="F.NO:-TAS/PUR/01" title="PURCHASE ORDER"
        meta={[['DATE', dmy(po.po_date)], ['PO NO.', po.po_no], ['PLANT', po.plant?.name || po.plant_code], ['PREPARED BY', po.created_by]]}
        party={[
          ['VENDOR', [po.vendor_name, po.vendor?.address, po.vendor?.vat_no && `VAT NO:- ${po.vendor.vat_no}`, po.vendor?.mobile && `CONTACT:- ${po.vendor.mobile}`]],
          ['DELIVER TO', [po.plant?.name || po.plant_code, po.plant?.address]],
        ]}
        heads={['MATERIAL', 'CODE', 'QTY', 'UOM', 'RATE (SAR)', 'AMOUNT (SAR)']}
        rows={po.items.map((i) => [i.m.name, i.m.code, qty(i.qty), i.m.uom, money(i.rate), money(i.qty * i.rate)])}
        foot={['TOTAL (EXCL. VAT)', '', '', '', '', money(total)]}
        notes={po.notes}
        signs={['Prepared By', `Approved By${po.status !== 'PENDING' && po.status !== 'REJECTED' && po.action_by ? ` (${po.action_by})` : ''}`]}
      />

      <div className="card no-print" style={{ marginTop: 20 }}>
        <div className="tbl-top"><h2 className="tbl-ttl"><i className="ph ph-truck" />Received against this PO</h2></div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Material</th><th className="r">Ordered</th><th className="r">Received</th><th className="r">Pending</th></tr></thead>
            <tbody>
              {po.items.map((i) => (
                <tr key={i.id}>
                  <td><span className="mat-name">{i.m.name}</span><span className="mat-sub">{i.m.code}</span></td>
                  <td className="num" data-label="Ordered">{qty(i.qty)} {i.m.uom}</td>
                  <td className="num" data-label="Received">{qty(i.received_qty)}</td>
                  <td className="num fw6" data-label="Pending">{qty(Math.max(0, i.pending_qty))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {po.grns.length > 0 && (
          <div className="tbl-foot">
            <div className="row">
              {po.grns.sort((a, b) => a.id - b.id).map((g) => (
                <Link prefetch={false} key={g.id} href={`/inventory/grn/${g.id}`} className="chip-link">
                  {g.grn_no} · {day(g.grn_date)} · {g.status === 'DONE' ? 'QC done' : 'QC pending'}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
