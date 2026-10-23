import { balanceOf, int, readyOf } from '@/lib/tas'
import { markReady } from '../orders/actions'
import { Modal, ModalFoot } from '../ui'

// Dialog to mark line item(s) ready for dispatch (partial or full).
export default function MarkReadyModal({ orderId, lines, back, label = 'Mark Ready', btnClass = 'btn btn-ghost btn-sm', size = 'default' }) {
  if (!lines?.length) return null

  return (
    <Modal
      title="Mark Items Ready for Dispatch"
      icon="ph-check-square-offset"
      label={label}
      btnIcon="ph-check-square-offset"
      btnClass={btnClass}
      size={size}
    >
      <form action={markReady}>
        <input type="hidden" name="id" value={orderId} />
        <input type="hidden" name="back" value={back} />
        <div className="modal-body">
          <p>
            Enter how many more pieces are finished. They are added to the quantity already ready;
            the DO is generated from Active Orders.
          </p>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Material Description</th>
                  <th className="r">Ordered</th>
                  <th className="r">Dispatched</th>
                  <th className="r">Ready (no DO yet)</th>
                  <th className="r">Remaining</th>
                  <th>Add Ready (PCS)</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((it) => {
                  const rQty = readyOf(it)
                  const remaining = Math.max(0, balanceOf(it) - rQty)
                  if (!remaining) return null
                  return (
                    <tr key={it.id}>
                      <td className="muted">{it.item_no}</td>
                      <td className="desc">{it.description}</td>
                      <td className="num">{int(it.qty)}</td>
                      <td className="num">{int(it.dispatched_qty) || 0}</td>
                      <td className="num">{int(rQty)}</td>
                      <td className="num fw6">{int(remaining)}</td>
                      <td>
                        <input
                          className="qty"
                          name={`ready_${it.id}`}
                          type="number"
                          min="1"
                          max={remaining}
                          step="1"
                          defaultValue={remaining}
                          required
                          aria-label={`Ready qty line ${it.item_no}`}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
        <ModalFoot label="Save Ready Quantities" icon="ph-check" cls="btn-success" />
      </form>
    </Modal>
  )
}
