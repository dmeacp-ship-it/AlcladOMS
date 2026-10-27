import { requireRole } from '@/lib/server'
import { invMasters, storeLabel } from '@/lib/inventory'
import { today } from '@/lib/tas'
import { createTransfer } from '../../actions'
import InvTabs from '../../InvTabs'
import LinesForm from '../../LinesForm'

export const metadata = { title: 'New Issue' }

export default async function NewIssue() {
  await requireRole('manager')
  const { missing, stores, materials } = await invMasters()
  const opts = (list) => list.map((s) => <option key={s.id} value={s.id}>{storeLabel(s)} · {s.type}</option>)
  return (
    <>
      <InvTabs tab="issue" missing={missing} />
      <LinesForm action={createTransfer} materials={materials} submit={{ label: 'Save issue', icon: 'ph-check' }}>
        <h2 className="fsec-ttl"><i className="ph ph-arrows-left-right" />Issue material</h2>
        <div className="fgrid-2">
          <div className="fg">
            <label htmlFor="from">From store <span className="req">*</span></label>
            <select id="from" name="from" required defaultValue=""><option value="" disabled>Select store…</option>{opts(stores)}</select>
          </div>
          <div className="fg">
            <label htmlFor="to">To line / store <span className="req">*</span></label>
            <select id="to" name="to" required defaultValue="">
              <option value="" disabled>Select production line or store…</option>
              {opts([...stores.filter((s) => s.type === 'WIP'), ...stores.filter((s) => s.type !== 'WIP')])}
            </select>
          </div>
          <div className="fg"><label htmlFor="date">Issue date</label><input id="date" name="date" type="date" defaultValue={today()} max={today()} required /></div>
          <div className="fg"><label htmlFor="requested_by">Requested by</label><input id="requested_by" name="requested_by" placeholder="Shift incharge / operator" /></div>
          <div className="fg full"><label htmlFor="notes">Notes</label><input id="notes" name="notes" /></div>
        </div>
      </LinesForm>
    </>
  )
}
