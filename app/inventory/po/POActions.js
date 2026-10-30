'use client'
import Link from 'next/link'
import { can, money, qty } from '@/lib/tas'
import { approvePO, rejectPO } from '../actions'
import { Modal, ModalFoot } from '../../ui'

export default function POActions({ po, me, back, receiveHref, qcHref }) {
  const pendingQty = Number(po.pending_qty || 0)
  const isPending = po.status === 'PENDING'
  const isApproved = po.status === 'APPROVED'

  const pendingQC = (po.grns || []).find((g) => g.status === 'QC_PENDING')

  const Hidden = (
    <>
      <input type="hidden" name="id" value={po.id} />
      <input type="hidden" name="back" value={back} />
    </>
  )

  return (
    <div className="row-acts">
      {/* 1. Pending Approval Actions */}
      {isPending && me?.role === 'admin' && (
        <>
          <Modal
            title={`Reject ${po.po_no}`}
            icon="ph-x-circle"
            label="Reject"
            btnIcon="ph-x-circle"
            btnClass="btn btn-danger btn-sm"
            size="small"
          >
            <form action={rejectPO}>
              {Hidden}
              <div className="modal-body">
                <div className="fg">
                  <label htmlFor={`rej-${po.id}`}>Reason for rejection <span className="req">*</span></label>
                  <textarea id={`rej-${po.id}`} name="reason" rows={3} required autoFocus placeholder="e.g. price outdated, wrong quantity…" />
                </div>
              </div>
              <ModalFoot label="Reject PO" icon="ph-x-circle" cls="btn-danger" />
            </form>
          </Modal>

          <Modal
            title={`Approve ${po.po_no}`}
            icon="ph-seal-check"
            label="Approve"
            btnIcon="ph-check-circle"
            btnClass="btn btn-success btn-sm"
            size="small"
          >
            <form action={approvePO}>
              {Hidden}
              <div className="modal-body">
                <p>Approve purchase order <b>{po.po_no}</b> for <b><bdi>{po.vendor_name}</bdi></b> worth <b>SAR {money(po.value)}</b>?</p>
                <p className="muted text-sm">Once approved, incoming goods can be received and checked into stock.</p>
              </div>
              <ModalFoot label="Approve PO" icon="ph-check-circle" cls="btn-success" />
            </form>
          </Modal>
        </>
      )}

      {/* 2. Approved Actions: Receive Goods */}
      {isApproved && pendingQty > 0 && (
        <Link
          prefetch={false}
          href={receiveHref}
          scroll={false}
          className="btn btn-primary btn-sm"
          title="Receive incoming materials for this PO"
        >
          <i className="ph ph-truck" />
          <span>Receive Goods</span>
        </Link>
      )}

      {/* 3. Awaiting QC Check */}
      {pendingQC && qcHref && (
        <Link
          prefetch={false}
          href={qcHref}
          scroll={false}
          className="btn btn-warn btn-sm"
          title={`GRN ${pendingQC.grn_no} waiting for QC inspection`}
        >
          <i className="ph ph-seal-check" />
          <span>Check (QC)</span>
        </Link>
      )}

      {/* 4. Completely received & QC done */}
      {isApproved && pendingQty <= 0 && !pendingQC && (
        <span className="badge b-ok">
          <i className="ph ph-check" />
          <span>Received</span>
        </span>
      )}
    </div>
  )
}
