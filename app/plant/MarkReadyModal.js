import { balanceOf, int, readyOf } from '@/lib/tas'
import { markReady } from '../orders/actions'
import { Modal, ModalFoot } from '../ui'

// Dialog to mark line item(s) ready for dispatch (partial or full). Lines may belong to several orders.
// The quantity field sits right after the material, so it is the first thing to check before saving.
export default function MarkReadyModal({ lines, back, label = 'Mark Ready', btnClass = 'btn btn-ghost btn-sm' }) {
  const open = (lines || []).filter((it) => balanceOf(it) - readyOf(it) > 0)
  if (!open.length) return null
  const orderIds = [...new Set(open.map((it) => it.order_id))]
  const many = orderIds.length > 1

  return (
    <Modal
      title={open.length === 1 ? 'Mark pieces ready for dispatch' : `Mark ${open.length} lines ready for dispatch`}
      icon="ph-check-square-offset"
      label={label}
      btnIcon="ph-check-square-offset"
      btnClass={btnClass}
      size="large"
    >
      <form action={markReady}>
        {orderIds.map((id) => <input key={id} type="hidden" name="id" value={id} />)}
        <input type="hidden" name="back" value={back} />
        <div className="modal-body">
          <p>How many more pieces are finished? They are added to what is already ready. The Delivery Order is then generated from Active Orders.</p>
          <div className="tbl-wrap">
            <table className="tbl ready-tbl">
              <thead>
                <tr>
                  <th>{many ? 'Quote' : '#'}</th>
                  <th>Material</th>
                  <th>Add ready (PCS)</th>
                  <th className="r">Remaining</th>
                  <th className="r">Ready, no DO yet</th>
                  <th className="r">Ordered</th>
                  <th className="r">Dispatched</th>
                </tr>
              </thead>
              <tbody>
                {open.map((it) => {
                  const rQty = readyOf(it)
                  const remaining = Math.max(0, balanceOf(it) - rQty)
                  // Orders use FG stock: start at what is free in FG (the server refuses more).
                  const offer = it.fg_cap && it.fg_free != null ? Math.min(remaining, Math.max(0, it.fg_free)) : remaining
                  return (
                    <tr key={it.id}>
                      <td className="muted nowrap">{many ? it.orders?.quote_no : it.item_no}</td>
                      <td className="desc wrap">{it.description}{(it.color_name || it.fg_free != null) && <span className="cell-sub">{[it.color_name, it.fg_free != null && `FG free: ${int(it.fg_free)} pcs`].filter(Boolean).join(' · ')}</span>}</td>
                      <td>
                        <input
                          className="qty big"
                          name={`ready_${it.id}`}
                          type="number"
                          inputMode="numeric"
                          min="0"
                          max={remaining}
                          step="1"
                          defaultValue={offer}
                          required
                          aria-label={`Pieces ready, line ${it.item_no}, up to ${remaining}`}
                        />
                      </td>
                      <td className="num fw6">{int(remaining)}</td>
                      <td className="num">{int(rQty)}</td>
                      <td className="num">{int(it.qty)}</td>
                      <td className="num">{int(it.dispatched_qty) || 0}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
        <ModalFoot label={open.length === 1 ? 'Save ready quantity' : 'Save ready quantities'} icon="ph-check" cls="btn-success" />
      </form>
    </Modal>
  )
}
