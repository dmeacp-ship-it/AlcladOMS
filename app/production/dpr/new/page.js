import { db, requireRole } from '@/lib/server'
import { invMasters, storeLabel } from '@/lib/inventory'
import { SHIFTS, fgItems, prodMissing } from '@/lib/production'
import { listCoreSettings } from '@/lib/bom-server'
import { qty, today } from '@/lib/tas'
import { Combobox } from '../../../ui'
import ProdTabs from '../../ProdTabs'
import DprForm from '../DprForm'

export const metadata = { title: 'Enter Production' }

// ?plan=<id>: production against an open plan (line, shift and items filled in from it).
export default async function NewDpr({ searchParams }) {
  const planId = (await searchParams).plan
  const [, missing, { stores, materials }, fg, { data: options }, { settings: coreSettings }, plan] = await Promise.all([
    requireRole('manager'), prodMissing(), invMasters(), fgItems(), db().rpc('item_options'), listCoreSettings(),
    /^\d+$/.test(planId || '')
      ? db().from('production_plans').select('id, plan_no, shift, line_store_id, status, items:plan_items(id, fg_item_id, qty, produced_qty, f:fg_items(code, color_name))').eq('id', planId).maybeSingle().then((r) => r.data)
      : null,
  ])
  const wip = stores.filter((s) => s.type === 'WIP')
  const planRows = plan?.status === 'OPEN' && plan.items.sort((a, b) => a.id - b.id).map((i) => ({
    item: String(i.fg_item_id), plan_item: String(i.id), planned: qty(Math.max(0, i.qty - i.produced_qty)),
    label: `${i.f.code}${i.f.color_name ? ` · ${i.f.color_name}` : ''}`,
  }))
  return (
    <>
      <ProdTabs tab="dpr" missing={missing} />
      <DprForm fg={fg.filter((f) => !f.b_grade)} materials={materials} planRows={planRows || null} options={options || {}} coreSettings={coreSettings}>
        <h2 className="fsec-ttl"><i className="ph ph-factory" />Production entry{planRows && ` for ${plan.plan_no}`}</h2>
        {planRows && <input type="hidden" name="plan" value={plan.id} />}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(130px, 0.9fr) minmax(120px, 0.8fr) minmax(180px, 1.4fr) minmax(150px, 1.1fr) minmax(180px, 1.8fr)', gap: 12, alignItems: 'flex-end' }}>
          <div className="fg"><label htmlFor="date">Date</label><input id="date" name="date" type="date" defaultValue={today()} max={today()} required /></div>
          <div className="fg">
            <label htmlFor="shift">Shift</label>
            <Combobox
              id="shift"
              name="shift"
              defaultValue={plan?.shift || 'DAY'}
              required
              options={Object.entries(SHIFTS).map(([k, l]) => ({ value: k, label: l }))}
            />
          </div>
          <div className="fg">
            <label htmlFor="line">Production line <span className="req">*</span></label>
            <Combobox
              id="line"
              name="line"
              defaultValue={plan?.line_store_id ? String(plan.line_store_id) : (wip.length === 1 ? String(wip[0].id) : '')}
              placeholder="Select line…"
              required
              requiredMsg="Choose a production line."
              options={wip.map((s) => ({
                value: String(s.id),
                label: storeLabel(s),
                badge: s.type,
              }))}
            />
          </div>
          <div className="fg"><label htmlFor="operator">Operator / incharge</label><input id="operator" name="operator" placeholder="Shift incharge…" /></div>
          <div className="fg"><label htmlFor="notes">Notes</label><input id="notes" name="notes" placeholder="Breakdowns, coil changes…" /></div>
        </div>
      </DprForm>
    </>
  )
}
