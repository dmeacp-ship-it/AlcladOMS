import Link from 'next/link'
import { db, fetchAll, requireRole } from '@/lib/server'
import { invMasters, storeLabel } from '@/lib/inventory'
import { SHIFTS, fgItems, fgPosition, prodMissing } from '@/lib/production'
import { getSettings } from '@/lib/settings'
import { day, money, qty, today } from '@/lib/tas'
import { ClickRow } from '../ui'
import { createPlan } from './actions'
import ActionForm from '../inventory/ActionForm'
import ProdTabs from './ProdTabs'

export const metadata = { title: 'Production Planning' }

// Planning board: what all open orders still need, by product + size, after FG stock, open plans and pieces in QC.
// One plan (date + shift + line) covers many orders; no work order per sales order.
export default async function Planning() {
  const [, missing, s, pos, items, { stores }, lines, { data: plans }] = await Promise.all([
    requireRole('manager'), prodMissing(), getSettings(), fgPosition(), fgItems(), invMasters(),
    fetchAll(() => db().from('order_items').select('fg_item_id, qty, dispatched_qty, ready_qty, orders!inner(quote_no, status, dispatch_status)')
      .eq('orders.status', 'APPROVED').filter('orders.dispatch_status', 'isdistinct', 'SHORT_CLOSED')).catch(() => []),
    db().from('production_plans').select('*, line:stores(name, plant_code), items:plan_items(qty, produced_qty)').eq('status', 'OPEN').order('plan_date').order('id'),
  ])
  const byId = Object.fromEntries(items.map((f) => [f.id, f]))
  const quotes = {}
  for (const l of lines) if (l.qty > (l.dispatched_qty || 0) + (l.ready_qty || 0)) (quotes[l.fg_item_id] ??= new Set()).add(l.orders.quote_no)
  const rows = Object.values(pos).filter((p) => p.need > 0).map((p) => ({ ...p, f: byId[p.fg_item_id] }))
    .sort((a, b) => b.short - a.short || (a.f?.code || '').localeCompare(b.f?.code || ''))
  const wip = stores.filter((x) => x.type === 'WIP')
  const toMake = rows.reduce((n, r) => n + r.short, 0)

  return (
    <>
      <ProdTabs tab="" missing={missing} />
      {!s.fg_store && !missing && (
        <div className="banner warn" style={{ marginBottom: 16 }}><i className="ph ph-warning" /><span>Pick the FG store orders ship from in Company Settings → Inventory, so FG stock counts on this board.</span></div>
      )}

      <ActionForm action={createPlan} submit={{ label: 'Create production plan', icon: 'ph-calendar-check' }}>
        <div className="card">
          <div className="tbl-top">
            <h2 className="tbl-ttl"><i className="ph ph-list-checks" />What open orders still need <span className="badge b-none">{rows.length}</span>
              {toMake > 0 && <span className="badge b-bad">{qty(toMake)} pcs to plan</span>}</h2>
            <span className="muted text-sm">Short = still needed − free FG − already planned − waiting for QC. Enter the pieces this plan makes.</span>
          </div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Item (product + size)</th><th>Orders</th><th className="r">Needed</th><th className="r">FG free</th><th className="r">Planned</th><th className="r">In QC</th><th className="r">Short</th><th>Plan now (pcs)</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.fg_item_id}>
                    <td data-label="Item"><span className="mat-name">{r.f?.code}</span><span className="mat-sub">{[r.f?.color_name, `${money(r.f?.m2_per_pc)} M2 / pc`].filter(Boolean).join(' · ')}</span></td>
                    <td className="text-sm" data-label="Orders">{[...(quotes[r.fg_item_id] || [])].join(', ') || <span className="muted">—</span>}</td>
                    <td className="num" data-label="Needed">{qty(r.need)}</td>
                    <td className="num" data-label="FG free">{qty(Math.max(0, r.free))}</td>
                    <td className="num" data-label="Planned">{r.planned ? qty(r.planned) : <span className="muted">0</span>}</td>
                    <td className="num" data-label="In QC">{r.in_qc ? qty(r.in_qc) : <span className="muted">0</span>}</td>
                    <td className={`num fw6${r.short ? ' red' : ''}`} data-label="Short">{qty(r.short)}<span className="mat-sub">{money(r.short * (r.f?.m2_per_pc || 0))} M2</span></td>
                    <td data-label="Plan now">
                      <input type="hidden" name="item" value={r.fg_item_id} />
                      <input name={`qty_${r.fg_item_id}`} type="number" inputMode="numeric" min={0} step={1} defaultValue={r.short || ''} aria-label={`Pieces to plan, ${r.f?.code}`} style={{ width: 100 }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.length && <div className="empty"><i className="ph ph-check-circle" /><h3>Nothing to plan</h3><p>Every open order is covered by FG stock, a plan or pieces in QC.</p></div>}
          </div>
        </div>
        {rows.length > 0 && (
          <section className="fsec compact" style={{ marginTop: 16 }}>
            <h2 className="fsec-ttl"><i className="ph ph-calendar-check" />Plan for</h2>
            <div className="fgrid-4">
              <div className="fg"><label htmlFor="date">Date</label><input id="date" name="date" type="date" defaultValue={today()} required /></div>
              <div className="fg">
                <label htmlFor="shift">Shift</label>
                <select id="shift" name="shift" defaultValue="DAY">{Object.entries(SHIFTS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
              </div>
              <div className="fg">
                <label htmlFor="line">Production line <span className="req">*</span></label>
                <select id="line" name="line" required defaultValue={wip.length === 1 ? wip[0].id : ''}>
                  <option value="" disabled>Select line…</option>
                  {wip.map((x) => <option key={x.id} value={x.id}>{storeLabel(x)}</option>)}
                </select>
              </div>
              <div className="fg"><label htmlFor="notes">Notes</label><input id="notes" name="notes" /></div>
            </div>
            {!wip.length && <p className="red text-sm" style={{ marginTop: 10 }}>Add the production lines as stores of type WIP under Settings → Stores.</p>}
          </section>
        )}
      </ActionForm>

      <div className="card" style={{ marginTop: 20 }}>
        <div className="tbl-top"><h2 className="tbl-ttl"><i className="ph ph-calendar-check" />Open plans <span className="badge b-none">{plans?.length ?? 0}</span></h2></div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Plan No</th><th>Date</th><th>Shift</th><th>Line</th><th className="r">Planned pcs</th><th className="r">Produced</th></tr></thead>
            <tbody>
              {plans?.map((p) => (
                <ClickRow key={p.id} href={`/production/plan/${p.id}`}>
                  <td className="nowrap"><Link prefetch={false} className="qno" href={`/production/plan/${p.id}`}>{p.plan_no}</Link></td>
                  <td className="nowrap" data-label="Date">{day(p.plan_date)}</td>
                  <td data-label="Shift">{SHIFTS[p.shift]}</td>
                  <td data-label="Line">{storeLabel(p.line)}</td>
                  <td className="num" data-label="Planned">{qty(p.items.reduce((n, i) => n + Number(i.qty), 0))}</td>
                  <td className="num" data-label="Produced">{qty(p.items.reduce((n, i) => n + Number(i.produced_qty), 0))}</td>
                </ClickRow>
              ))}
            </tbody>
          </table>
          {!plans?.length && <div className="empty"><i className="ph ph-calendar-check" /><h3>No open plans</h3><p>Plans close by themselves once everything on them is produced.</p></div>}
        </div>
      </div>
    </>
  )
}
