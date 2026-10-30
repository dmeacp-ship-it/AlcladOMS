import Link from 'next/link'
import { PO_STATUS, day, dmy, money, qty } from '@/lib/tas'
import { Modal, ModalFoot, PrintButton, RouteDialog, Submit } from '../../ui'
import { approvePO, closePO, rejectPO } from '../actions'
import Slip from '../Slip'

export default function PODialog({ po, s, me, back, closeHref }) {
  if (!po) return null
  po.items.sort((a, b) => a.line_no - b.line_no)
  const [label, cls] = PO_STATUS[po.status]
  const total = po.items.reduce((n, i) => n + i.qty * i.rate, 0)

  const reasonModal = (action, title, btn, cls2) => (
    <Modal
      title={title}
      icon="ph-warning-circle"
      label={btn}
      btnIcon={cls2 === 'btn-danger' ? 'ph-x-circle' : 'ph-prohibit'}
      btnClass={`btn ${cls2 === 'btn-danger' ? 'btn-danger' : 'btn-ghost'}`}
      size="small"
    >
      <form action={action}>
        <input type="hidden" name="id" value={po.id} />
        <input type="hidden" name="back" value={back} />
        <div className="modal-body">
          <div className="fg">
            <label htmlFor={`r-${po.id}-${cls2}`}>Reason <span className="req">*</span></label>
            <textarea id={`r-${po.id}-${cls2}`} name="reason" rows={3} required />
          </div>
        </div>
        <ModalFoot label={btn} icon="ph-check" cls={cls2} />
      </form>
    </Modal>
  )

  const footer = (
    <>
      <PrintButton cls="btn btn-primary" />
      {po.status === 'PENDING' && me.role === 'admin' && (
        <>
          {reasonModal(rejectPO, `Reject ${po.po_no}?`, 'Reject', 'btn-danger')}
          <form action={approvePO} style={{ display: 'inline' }}>
            <input type="hidden" name="id" value={po.id} />
            <input type="hidden" name="back" value={back} />
            <Submit label="Approve" icon="ph-check" cls="btn btn-success" />
          </form>
        </>
      )}
      {po.status === 'APPROVED' && (
        <>
          {reasonModal(closePO, `Close ${po.po_no}?`, 'Close PO', 'btn-ghost')}
          <Link prefetch={false} href={`/inventory/po?receive=${po.id}`} className="btn btn-primary">
            <i className="ph ph-truck" />Receive goods
          </Link>
        </>
      )}
    </>
  )

  return (
    <RouteDialog
      key={po.id}
      icon="ph-shopping-cart"
      title={<>PO {po.po_no} <span className={`badge ${cls}`}>{label}</span></>}
      footer={footer}
      closeHref={closeHref}
    >
      {po.reason && (
        <div className={`banner ${po.status === 'REJECTED' ? 'error' : 'info'} no-print`} style={{ marginBottom: 16 }}>
          <i className={`ph ${po.status === 'REJECTED' ? 'ph-x-circle' : 'ph-info'}`} />
          <span>{po.reason}{po.action_by && ` · ${po.action_by}`}</span>
        </div>
      )}
      {po.status === 'PENDING' && me.role !== 'admin' && (
        <div className="banner info no-print mb-16">
          <i className="ph ph-hourglass" />
          <span>Waiting for an admin to approve</span>
        </div>
      )}

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

      <div className="card no-print mt-20">
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
        {po.grns?.length > 0 && (
          <div className="tbl-foot">
            <div className="row">
              {po.grns.sort((a, b) => a.id - b.id).map((g) => (
                <Link prefetch={false} key={g.id} href={`/inventory/po?view_grn=${g.id}`} className="chip-link">
                  {g.grn_no} · {day(g.grn_date)} · {g.status === 'DONE' ? 'QC done' : 'QC pending'}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </RouteDialog>
  )
}
