import { db, requireRole } from '@/lib/server'
import { invMasters, storeLabel } from '@/lib/inventory'
import { SHIFTS, fgItems, prodMissing } from '@/lib/production'
import { qty, today } from '@/lib/tas'
import ProdTabs from '../../ProdTabs'
import DprForm from '../DprForm'

export const metadata = { title: 'Enter Production' }

// ?plan=<id>: production against an open plan (line, shift and items filled in from it).
export default async function NewDpr({ searchParams }) {
  const planId = (await searchParams).plan
  const [, missing, { stores, materials }, fg, plan] = await Promise.all([
    requireRole('manager'), prodMissing(), invMasters(), fgItems(),
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
      <DprForm fg={fg.filter((f) => !f.b_grade)} materials={materials} planRows={planRows || null}>
        <h2 className="fsec-ttl"><i className="ph ph-factory" />Production entry{planRows && ` for ${plan.plan_no}`}</h2>
        {planRows && <input type="hidden" name="plan" value={plan.id} />}
        <div className="fgrid-4">
          <div className="fg"><label htmlFor="date">Date</label><input id="date" name="date" type="date" defaultValue={today()} max={today()} required /></div>
          <div className="fg">
            <label htmlFor="shift">Shift</label>
            <select id="shift" name="shift" defaultValue={plan?.shift || 'DAY'}>{Object.entries(SHIFTS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          </div>
          <div className="fg">
            <label htmlFor="line">Production line <span className="req">*</span></label>
            <select id="line" name="line" required defaultValue={plan?.line_store_id || (wip.length === 1 ? wip[0].id : '')}>
              <option value="" disabled>Select line…</option>
              {wip.map((s) => <option key={s.id} value={s.id}>{storeLabel(s)}</option>)}
            </select>
          </div>
          <div className="fg"><label htmlFor="operator">Operator / shift incharge</label><input id="operator" name="operator" /></div>
          <div className="fg full"><label htmlFor="notes">Notes</label><input id="notes" name="notes" placeholder="Breakdowns, coil changes…" /></div>
        </div>
      </DprForm>
    </>
  )
}
