import { db, requireRole } from '@/lib/server'
import { invMasters, storeLabel } from '@/lib/inventory'
import { today } from '@/lib/tas'
import { Combobox } from '../../../ui'
import { createTransfer } from '../../actions'
import InvTabs from '../../InvTabs'
import LinesForm from '../../LinesForm'

export const metadata = { title: 'New Issue' }

// ?plan=<id>: RM for a production plan — goes to the plan's line, from that plant's RM store, and is linked to the plan.
export default async function NewIssue({ searchParams }) {
  const planId = (await searchParams).plan
  const [, { missing, stores, materials }, plan] = await Promise.all([
    requireRole('manager'),
    invMasters(),
    /^\d+$/.test(planId || '') ? db().from('production_plans').select('id, plan_no, line_store_id, line:stores(plant_code)').eq('id', planId).maybeSingle().then((r) => r.data) : null,
  ])
  const rm = plan && stores.filter((s) => s.plant_code === plan.line.plant_code && s.type === 'RM')
  return (
    <>
      <InvTabs tab="issue" missing={missing} />
      <LinesForm action={createTransfer} materials={materials} submit={{ label: 'Save issue', icon: 'ph-check' }}>
        <h2 className="fsec-ttl"><i className="ph ph-arrows-left-right" />Issue material{plan && ` for ${plan.plan_no}`}</h2>
        {plan && <input type="hidden" name="plan" value={plan.id} />}
        <div className="fgrid-2">
          <div className="fg">
            <label htmlFor="from">From store <span className="req">*</span></label>
            <Combobox
              id="from"
              name="from"
              defaultValue={rm?.length === 1 ? String(rm[0].id) : ''}
              placeholder="Select store…"
              required
              requiredMsg="Choose a source store."
              wide
              options={stores.map((s) => ({
                value: String(s.id),
                label: storeLabel(s),
                badge: s.type,
              }))}
            />
          </div>
          <div className="fg">
            <label htmlFor="to">To line / store <span className="req">*</span></label>
            <Combobox
              id="to"
              name="to"
              defaultValue={plan?.line_store_id ? String(plan.line_store_id) : ''}
              placeholder="Select production line or store…"
              required
              requiredMsg="Choose a destination line or store."
              wide
              options={[...stores.filter((s) => s.type === 'WIP'), ...stores.filter((s) => s.type !== 'WIP')].map((s) => ({
                value: String(s.id),
                label: storeLabel(s),
                badge: s.type,
              }))}
            />
          </div>
          <div className="fg"><label htmlFor="date">Issue date</label><input id="date" name="date" type="date" defaultValue={today()} max={today()} required /></div>
          <div className="fg"><label htmlFor="requested_by">Requested by</label><input id="requested_by" name="requested_by" placeholder="Shift incharge / operator" /></div>
          <div className="fg full"><label htmlFor="notes">Notes</label><input id="notes" name="notes" /></div>
        </div>
      </LinesForm>
    </>
  )
}
