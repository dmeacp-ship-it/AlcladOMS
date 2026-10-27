import { requireRole } from '@/lib/server'
import { invMasters } from '@/lib/inventory'
import { today } from '@/lib/tas'
import { createPO } from '../../actions'
import InvTabs from '../../InvTabs'
import LinesForm from '../../LinesForm'

export const metadata = { title: 'New Purchase Order' }

export default async function NewPO() {
  await requireRole('manager')
  const { missing, plants, vendors, materials } = await invMasters()
  return (
    <>
      <InvTabs tab="po" missing={missing} />
      <LinesForm action={createPO} materials={materials} rate submit={{ label: 'Create PO', icon: 'ph-paper-plane-tilt' }}>
        <h2 className="fsec-ttl"><i className="ph ph-shopping-cart" />New Purchase Order</h2>
        <div className="fgrid-2">
          <div className="fg">
            <label htmlFor="vendor">Vendor <span className="req">*</span></label>
            <select id="vendor" name="vendor" required defaultValue="">
              <option value="" disabled>Select vendor…</option>
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.name} ({v.code})</option>)}
            </select>
          </div>
          <div className="fg">
            <label htmlFor="plant">For plant <span className="req">*</span></label>
            <select id="plant" name="plant" required defaultValue={plants.length === 1 ? plants[0].code : ''}>
              <option value="" disabled>Select plant…</option>
              {plants.map((p) => <option key={p.code} value={p.code}>{p.name} ({p.code})</option>)}
            </select>
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
    </>
  )
}
