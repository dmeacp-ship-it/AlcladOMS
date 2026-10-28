import Link from 'next/link'
import { db, fetchAll, requireRole } from '@/lib/server'
import { invMasters, storeLabel } from '@/lib/inventory'
import { SHIFTS, fgItems, fgPosition, prodMissing } from '@/lib/production'
import { getSettings } from '@/lib/settings'
import { money, qty, today } from '@/lib/tas'
import { Combobox } from '../../ui'
import { createPlan } from '../actions'
import ActionForm from '../../inventory/ActionForm'
import ProdTabs from '../ProdTabs'
import PlanBufferSection from './PlanBufferSection'

export const metadata = { title: 'New Production Plan' }

export default async function NewPlan({ searchParams }) {
  const sp = await searchParams
  const showAll = sp.show === 'all'

  const [me, missing, s, pos, items, { stores }, lines, { data: options }] = await Promise.all([
    requireRole('manager'),
    prodMissing(),
    getSettings(),
    fgPosition(),
    fgItems(),
    invMasters(),
    fetchAll(() => db().from('order_items').select('fg_item_id, qty, dispatched_qty, ready_qty, orders!inner(quote_no, status, dispatch_status)')
      .eq('orders.status', 'APPROVED').filter('orders.dispatch_status', 'isdistinct', 'SHORT_CLOSED')).catch(() => []),
    db().rpc('item_options'),
  ])

  const byId = Object.fromEntries(items.map((f) => [f.id, f]))
  const quotes = {}
  for (const l of lines) {
    if (l.qty > (l.dispatched_qty || 0) + (l.ready_qty || 0)) {
      (quotes[l.fg_item_id] ??= new Set()).add(l.orders.quote_no)
    }
  }

  const allOrderRows = Object.values(pos).filter((p) => p.need > 0).map((p) => ({ ...p, f: byId[p.fg_item_id] }))
    .sort((a, b) => b.short - a.short || (a.f?.code || '').localeCompare(b.f?.code || ''))
  const hasShortages = allOrderRows.some((p) => p.short > 0)
  const rows = (showAll || !hasShortages) ? allOrderRows : allOrderRows.filter((p) => p.short > 0)
  const wip = stores.filter((x) => x.type === 'WIP')
  const toMake = allOrderRows.reduce((n, r) => n + r.short, 0)

  return (
    <>
      <ProdTabs tab="" missing={missing} />
      {!s.fg_store && !missing && me.role === 'admin' && (
        <div className="banner warn" style={{ marginBottom: 16 }}>
          <i className="ph ph-warning" />
          <span>Pick the finished goods store orders ship from in Company Settings → Inventory, so its stock counts here.</span>
        </div>
      )}

      <ActionForm action={createPlan} submit={{ label: 'Create production plan', icon: 'ph-calendar-check' }}>
        <section className="fsec compact">
          <h2 className="fsec-ttl"><i className="ph ph-calendar-check" />Plan for</h2>
          <div className="fgrid-4">
            <div className="fg">
              <label htmlFor="line">Production line <span className="req">*</span></label>
              <Combobox
                id="line"
                name="line"
                defaultValue={wip.length === 1 ? String(wip[0].id) : ''}
                placeholder="Select line…"
                required
                requiredMsg="Choose a production line."
                options={wip.map((x) => ({
                  value: String(x.id),
                  label: storeLabel(x),
                  badge: x.type,
                }))}
              />
            </div>
            <div className="fg">
              <label htmlFor="date">Date</label>
              <input id="date" name="date" type="date" defaultValue={today()} required />
            </div>
            <div className="fg">
              <label htmlFor="shift">Shift</label>
              <Combobox
                id="shift"
                name="shift"
                defaultValue="DAY"
                required
                options={Object.entries(SHIFTS).map(([k, l]) => ({ value: k, label: l }))}
              />
            </div>
            <div className="fg">
              <label htmlFor="notes">Notes</label>
              <input id="notes" name="notes" placeholder="Notes…" />
            </div>
          </div>
          {!wip.length && (
            <p className="red text-sm" style={{ marginTop: 10 }}>
              Add the production lines as stores of type WIP under Settings → Stores.
            </p>
          )}
        </section>

        <div className="card" style={{ marginTop: 16 }}>
          <div className="tbl-top">
            <h2 className="tbl-ttl">
              <i className="ph ph-list-checks" />What open orders still need <span className="badge b-none">{rows.length}</span>
              {toMake > 0 && <span className="badge b-bad">{qty(toMake)} pcs still to make</span>}
            </h2>
            <div className="tbl-filters">
              <nav className="tabs" aria-label="Shortages filter" style={{ marginBottom: 0 }}>
                <Link prefetch={false} href="/production/new" className={`tab${!showAll && hasShortages ? ' on' : ''}`}>Shortages</Link>
                <Link prefetch={false} href="/production/new?show=all" className={`tab${showAll || !hasShortages ? ' on' : ''}`}>All</Link>
              </nav>
            </div>
          </div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Item (product + size)</th>
                  <th>Orders</th>
                  <th className="r">Orders need</th>
                  <th className="r">In stock</th>
                  <th className="r">Already planned</th>
                  <th className="r">Being checked</th>
                  <th className="r">Still to make</th>
                  <th>Make in this plan (pcs)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.fg_item_id}>
                    <td data-label="Item">
                      <span className="mat-name">{r.f?.code}</span>
                      <span className="mat-sub">{[r.f?.color_name, `${money(r.f?.m2_per_pc)} M2 / pc`].filter(Boolean).join(' · ')}</span>
                    </td>
                    <td className="text-sm" data-label="Orders">{[...(quotes[r.fg_item_id] || [])].join(', ') || <span className="muted">—</span>}</td>
                    <td className="num" data-label="Orders need">{qty(r.need)}</td>
                    <td className="num" data-label="In stock">{qty(Math.max(0, r.free))}</td>
                    <td className="num" data-label="Already planned">{r.planned ? qty(r.planned) : <span className="muted">0</span>}</td>
                    <td className="num" data-label="Being checked">{r.in_qc ? qty(r.in_qc) : <span className="muted">0</span>}</td>
                    <td className={`num fw6${r.short ? ' red' : ''}`} data-label="Still to make">
                      {qty(r.short)}
                      <span className="mat-sub">{money(r.short * (r.f?.m2_per_pc || 0))} M2</span>
                    </td>
                    <td data-label="Make in this plan">
                      <input type="hidden" name="item" value={r.fg_item_id} />
                      <input
                        name={`qty_${r.fg_item_id}`}
                        type="number"
                        inputMode="numeric"
                        min={0}
                        step={1}
                        defaultValue={r.short || ''}
                        aria-label={`Pieces to plan, ${r.f?.code}`}
                        style={{ width: 100 }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.length && (
              <div className="empty">
                <i className="ph ph-check-circle" />
                <h3>No order shortages</h3>
                <p>Every open order is covered by stock, a plan or pieces being checked. You can plan buffer stock below.</p>
              </div>
            )}
          </div>
        </div>

        <PlanBufferSection catalogItems={items} options={options || {}} />
      </ActionForm>
    </>
  )
}
