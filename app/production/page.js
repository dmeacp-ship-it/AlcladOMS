import Link from 'next/link'
import { db, fetchAll, requireRole } from '@/lib/server'
import { invMasters, storeLabel } from '@/lib/inventory'
import { SHIFTS, fgItems, fgPosition, prodMissing } from '@/lib/production'
import { getSettings } from '@/lib/settings'
import { day, qty, today } from '@/lib/tas'
import { ClickRow, LinkBusy } from '../ui'
import ProdTabs from './ProdTabs'
import PlanDialog from './PlanDialog'
import OrderNeedDialog from './OrderNeedDialog'
import NewPlanDialog from './NewPlanDialog'

export async function generateMetadata({ searchParams }) {
  const sp = await searchParams
  if (sp.new) return { title: 'New Production Plan' }
  if (/^\d+$/.test(sp.view || '')) {
    const { data } = await db().from('production_plans').select('plan_no').eq('id', sp.view).maybeSingle()
    if (data?.plan_no) return { title: { absolute: data.plan_no } }
  }
  if (sp.need) return { title: 'What Open Orders Need' }
  return { title: 'Production Planning' }
}

const LIMIT = 100

export default async function Planning({ searchParams }) {
  const sp = await searchParams
  const term = String(sp.q || '').replace(/[,()*%]/g, '').trim()
  const showPlans = sp.plans || 'open'
  const showAll = sp.show === 'all'
  const showNeed = Boolean(sp.need)
  const isNew = Boolean(sp.new)
  const viewId = /^\d+$/.test(sp.view || '') ? sp.view : null

  let q = db().from('production_plans')
    .select('*, line:stores(name, plant_code), items:plan_items(qty, produced_qty)')
    .order('plan_date', { ascending: false }).order('id', { ascending: false }).limit(LIMIT)
  if (showPlans === 'open') q = q.eq('status', 'OPEN')
  if (term) q = q.ilike('plan_no', `%${term}%`)

  const planQuery = viewId
    ? db().from('production_plans')
        .select('*, line:stores(id, name, plant_code), items:plan_items(*, f:fg_items(code, color_name, m2_per_pc, grade, thickness, skin)), issues:transfers(id, doc_no, doc_date), dprs:productions(id, dpr_no, prod_date)')
        .eq('id', viewId).maybeSingle()
    : Promise.resolve({ data: null })

  const optionsQuery = isNew ? db().rpc('item_options') : Promise.resolve({ data: {} })

  const [me, missing, s, pos, items, { stores }, lines, { data: plans }, { data: viewPlan }, { data: options }] = await Promise.all([
    requireRole('manager'),
    prodMissing(),
    getSettings(),
    fgPosition(),
    fgItems(),
    invMasters(),
    fetchAll(() => db().from('order_items').select('fg_item_id, qty, dispatched_qty, ready_qty, orders!inner(quote_no, status, dispatch_status)')
      .eq('orders.status', 'APPROVED').filter('orders.dispatch_status', 'isdistinct', 'SHORT_CLOSED')).catch(() => []),
    q,
    planQuery,
    optionsQuery,
  ])

  let stock = null
  let m2 = 0
  if (viewPlan) {
    viewPlan.items?.sort((a, b) => a.id - b.id)
    const { data: rm } = await db().rpc('stock_summary', { p_from: today(), p_to: today(), p_plant: viewPlan.line?.plant_code, p_store: null })
    const { data: rmStores } = await db().from('stores').select('id').eq('plant_code', viewPlan.line?.plant_code).in('type', ['RM', 'WIP'])
    const keep = new Set((rmStores || []).map((x) => x.id))
    stock = (rm || []).filter((r) => keep.has(r.store_id) && Number(r.closing) !== 0)
    m2 = viewPlan.items?.reduce((n, i) => n + i.qty * (i.f?.m2_per_pc || 0), 0) || 0
  }

  const byId = Object.fromEntries(items.map((f) => [f.id, f]))
  const quotes = {}
  for (const l of lines) {
    if (l.qty > (l.dispatched_qty || 0) + (l.ready_qty || 0)) {
      (quotes[l.fg_item_id] ??= new Set()).add(l.orders.quote_no)
    }
  }

  const allOrderRows = Object.values(pos).filter((p) => p.need > 0).map((p) => ({ ...p, f: byId[p.fg_item_id] }))
    .sort((a, b) => b.short - a.short || (a.f?.code || '').localeCompare(b.f?.code || ''))
  const rows = showAll ? allOrderRows : allOrderRows.filter((p) => p.short > 0)
  const toMake = allOrderRows.reduce((n, r) => n + r.short, 0)
  const wip = (stores || []).filter((x) => x.type === 'WIP')

  const listParams = {
    ...(term && { q: term }),
    ...(showPlans !== 'open' && { plans: showPlans }),
  }
  const viewHref = (id) => `/production?${new URLSearchParams({ ...listParams, view: id })}`
  const listHref = `/production${Object.keys(listParams).length ? `?${new URLSearchParams(listParams)}` : ''}`
  const newHref = (all) => {
    const p = new URLSearchParams()
    p.set('new', '1')
    if (all) p.set('show', 'all')
    if (showPlans !== 'open') p.set('plans', showPlans)
    if (term) p.set('q', term)
    return `/production?${p.toString()}`
  }

  const plansHref = (mode) => {
    const p = new URLSearchParams()
    if (mode !== 'open') p.set('plans', mode)
    if (term) p.set('q', term)
    const qs = p.toString()
    return `/production${qs ? `?${qs}` : ''}`
  }

  const needHref = (all) => {
    const p = new URLSearchParams()
    p.set('need', '1')
    if (all) p.set('show', 'all')
    if (showPlans !== 'open') p.set('plans', showPlans)
    if (term) p.set('q', term)
    return `/production?${p.toString()}`
  }

  const needCloseHref = listHref

  return (
    <>
      <ProdTabs tab="" missing={missing} />
      {!s.fg_store && !missing && me.role === 'admin' && (
        <div className="banner warn" style={{ marginBottom: 16 }}>
          <i className="ph ph-warning" />
          <span>Pick the finished goods store orders ship from in Company Settings → Inventory, so its stock counts here.</span>
        </div>
      )}

      {/* ── Production Plans Directory ── */}
      <div className="card">
        <div className="tbl-top">
          <h2 className="tbl-ttl">
            <i className="ph ph-calendar-check" />Production Plans <span className="badge b-none">{plans?.length ?? 0}</span>
          </h2>
          <div className="tbl-filters">
            <Link prefetch={false} href={needHref(false)} className="btn btn-ghost btn-sm" title="View what customer orders still need">
              <i className="ph ph-list-checks" />What orders need
              {toMake > 0 ? (
                <span className="badge b-bad">{qty(toMake)}</span>
              ) : (
                <span className="badge b-none">0</span>
              )}
            </Link>
            <nav className="tabs" aria-label="Plans status" style={{ marginBottom: 0 }}>
              <Link prefetch={false} href={plansHref('open')} className={`tab${showPlans === 'open' ? ' on' : ''}`}>
                <LinkBusy />Open Plans
              </Link>
              <Link prefetch={false} href={plansHref('all')} className={`tab${showPlans === 'all' ? ' on' : ''}`}>
                <LinkBusy />All Plans
              </Link>
            </nav>
            <form className="sw">
              {showPlans !== 'open' && <input type="hidden" name="plans" value={showPlans} />}
              <i className="ph ph-magnifying-glass" />
              <input className="tsearch" name="q" defaultValue={term} placeholder="Plan no or line…" aria-label="Search plans" />
            </form>
            <Link prefetch={false} href={newHref(false)} scroll={false} className="btn btn-primary btn-sm">
              <LinkBusy /><i className="ph ph-plus" />New Plan
            </Link>
          </div>
        </div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Plan No</th>
                <th>Date</th>
                <th>Shift</th>
                <th>Line</th>
                <th className="r">Planned pcs</th>
                <th className="r">Produced</th>
                <th>Status</th>
                <th className="r" style={{ width: 130 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {plans?.map((p) => {
                const plannedPcs = p.items.reduce((n, i) => n + Number(i.qty), 0)
                const producedPcs = p.items.reduce((n, i) => n + Number(i.produced_qty), 0)
                const pct = plannedPcs > 0 ? Math.min(100, Math.round((producedPcs / plannedPcs) * 100)) : 0
                const isComplete = producedPcs >= plannedPcs && plannedPcs > 0
                const isStarted = producedPcs > 0

                return (
                  <ClickRow key={p.id} href={viewHref(p.id)}>
                    <td className="nowrap"><Link prefetch={false} className="qno" href={viewHref(p.id)}>{p.plan_no}</Link></td>
                    <td className="nowrap" data-label="Date">{day(p.plan_date)}</td>
                    <td data-label="Shift">{SHIFTS[p.shift]}</td>
                    <td data-label="Line">{storeLabel(p.line)}</td>
                    <td className="num" data-label="Planned pcs">{qty(plannedPcs)}</td>
                    <td className="num fw6" data-label="Produced">{qty(producedPcs)}</td>
                    <td data-label="Status">
                      {isComplete ? (
                        <span className="badge b-ok">Completed</span>
                      ) : isStarted ? (
                        <span className="badge b-warn">In Progress · {pct}%</span>
                      ) : (
                        <span className="badge b-info">Scheduled</span>
                      )}
                    </td>
                    <td className="r nowrap" data-label="Actions">
                      <div className="row-acts">
                        {p.status === 'OPEN' && (
                          <Link
                            prefetch={false}
                            href={`/inventory/issue/new?plan=${p.id}`}
                            className="btn btn-ghost btn-sm"
                            title="Issue raw materials to line for this plan"
                          >
                            <i className="ph ph-arrows-left-right" /> Issue RM
                          </Link>
                        )}
                        <Link
                          prefetch={false}
                          href={`/production/dpr/new?plan=${p.id}`}
                          className="btn btn-primary btn-sm"
                          title="Enter shift production report"
                        >
                          <i className="ph ph-factory" /> Enter DPR
                        </Link>
                      </div>
                    </td>
                  </ClickRow>
                )
              })}
            </tbody>
          </table>
          {!plans?.length && (
            <div className="empty">
              <i className="ph ph-calendar-check" />
              <h3>No production plans found</h3>
              <p>Press New Plan to schedule a shift on a production line.</p>
            </div>
          )}
        </div>
      </div>

      {showNeed && (
        <OrderNeedDialog
          rows={rows}
          toMake={toMake}
          showAll={showAll}
          quotes={quotes}
          filterHref={needHref}
          closeHref={needCloseHref}
        />
      )}

      {viewPlan && (
        <PlanDialog
          plan={viewPlan}
          stock={stock}
          m2={m2}
          s={s}
          closeHref={listHref}
        />
      )}

      {isNew && !viewPlan && !showNeed && (
        <NewPlanDialog
          wip={wip}
          allOrderRows={allOrderRows}
          rows={rows}
          showAll={showAll}
          toMake={toMake}
          quotes={quotes}
          catalogItems={items}
          options={options || {}}
          shortagesHref={newHref(false)}
          allHref={newHref(true)}
          closeHref={listHref}
        />
      )}
    </>
  )
}
