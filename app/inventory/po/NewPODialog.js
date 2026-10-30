import { today } from '@/lib/tas'
import { Combobox, RouteDialog } from '../../ui'
import { createPO } from '../actions'
import LinesForm from '../LinesForm'

export default function NewPODialog({ plants = [], vendors = [], materials = [], closeHref }) {
  return (
    <RouteDialog
      icon="ph-shopping-cart"
      title="New Purchase Order"
      closeHref={closeHref}
    >
      <LinesForm action={createPO} materials={materials} rate submit={{ label: 'Create PO', icon: 'ph-paper-plane-tilt', cls: 'btn btn-primary' }}>
        <h2 className="fsec-ttl"><i className="ph ph-info" />PO Details</h2>
        <div className="po-header-row">
          <div className="fg">
            <label htmlFor="vendor">Vendor <span className="req">*</span></label>
            <Combobox
              id="vendor"
              name="vendor"
              placeholder="Search or select vendor…"
              required
              requiredMsg="Choose a vendor."
              wide
              options={vendors.map((v) => ({
                value: String(v.id),
                label: v.name,
                badge: v.code,
              }))}
            />
          </div>
          <div className="fg">
            <label htmlFor="plant">For plant <span className="req">*</span></label>
            <Combobox
              id="plant"
              name="plant"
              defaultValue={plants.length === 1 ? plants[0].code : ''}
              placeholder="Select plant…"
              required
              requiredMsg="Choose a plant."
              options={plants.map((p) => ({
                value: p.code,
                label: p.name,
                badge: p.code,
              }))}
            />
          </div>
          <div className="fg">
            <label htmlFor="date">PO date</label>
            <input id="date" name="date" type="date" defaultValue={today()} max={today()} required />
          </div>
          <div className="fg">
            <label htmlFor="notes">Notes</label>
            <input id="notes" name="notes" placeholder="Delivery terms, payment, remarks…" />
          </div>
        </div>
      </LinesForm>
    </RouteDialog>
  )
}
