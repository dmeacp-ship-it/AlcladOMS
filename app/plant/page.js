import Link from 'next/link'
import { IntentLink, LinkBusy } from '../ui'
import PageTabs from '../PageTabs'
import { db, requireRole } from '@/lib/server'
import { fgPosition } from '@/lib/production'
import { getSettings } from '@/lib/settings'
import PlantClient from './PlantClient'

// Plant dispatch (FMS plant screen): every approved order line in 1 flat row.
// The plant marks items ready (partial/full), sets plant status, and generates Delivery Orders.
const TABS = {
  open: { label: 'Open', icon: 'ph-factory' },
  ready: { label: 'Ready', icon: 'ph-check-square-offset' },
  pending: { label: 'Pending', icon: 'ph-hourglass' },
  partial: { label: 'Partial', icon: 'ph-circle-half' },
  done: { label: 'Dispatched', icon: 'ph-check-circle' },
}
const ITEM = 'id, order_id, item_no, fg_item_id, description, color_name, qty, width, length, price, delivered_qty, ready_qty, dispatched_qty, balance_qty, production_status, coil_date'
const ORDER = 'orders!inner(id, quote_no, doc_no, do_date, customer_name, status, dispatch_status)'
const LIMIT = 300

export const metadata = { title: 'Ready to Ship' }

// What each tab shows, as a filter on the line (balance_qty = qty - dispatched_qty, kept by the database).
const SHOWS = {
  open: (q) => q.gt('balance_qty', 0),
  ready: (q) => q.gt('balance_qty', 0).gt('ready_qty', 0),
  pending: (q) => q.gt('balance_qty', 0).eq('dispatched_qty', 0).lte('ready_qty', 0),
  partial: (q) => q.gt('balance_qty', 0).gt('dispatched_qty', 0),
  done: (q) => q.lte('balance_qty', 0),
}

export default async function Plant({ searchParams }) {
  const sp = await searchParams
  const tab = TABS[sp.tab] ? sp.tab : 'open'
  const term = String(sp.q || '').replace(/[,()*%]/g, '').trim()

  // Lines of approved orders; a short-closed order's balance will never ship, so its lines leave the plant's lists.
  // A search matches the material, or the order's quote no, DO no or customer (ids: the matching orders).
  const lines = (cols, opts, ids) => {
    let q = db().from('order_items').select(cols, opts).eq('orders.status', 'APPROVED').filter('orders.dispatch_status', 'isdistinct', 'SHORT_CLOSED')
    if (term) q = q.or(`description.ilike.%${term}%,order_id.in.(${ids?.join(',') || -1})`)
    return q
  }
  const list = (ids) => SHOWS[tab](lines(`${ITEM}, ${ORDER}`, undefined, ids)).order('order_id', { ascending: false }).order('item_no').limit(LIMIT)
  // One round trip: role check, every tab's count (plant_counts, migrate-014) and, without a search, this tab's lines.
  // One filter can't mix line and order columns, so a search finds the matching orders first and reads the lines after.
  const [me, found, pc, first, fg] = await Promise.all([
    requireRole('plant'),
    term && db().from('orders').select('id').eq('status', 'APPROVED')
      .or(`doc_no.ilike.%${term}%,quote_no.ilike.%${term}%,customer_name.ilike.%${term}%`),
    db().rpc('plant_counts', { p_term: term || null }),
    !term && list(),
    // Free FG pieces per item, once an FG store for orders is set (Company Settings → Inventory).
    // fg_cap: with "Orders use FG stock" on, Mark ready offers no more than is free.
    getSettings().then(async (st) => ({ on: !!st.fg_store, link: !!st.fg_link, pos: st.fg_store ? await fgPosition() : {} })),
  ])
  const ids = found?.data?.map((o) => o.id)
  const tabs = Object.keys(TABS)
  const [{ data: rows, error: listError }, ...n] = await Promise.all([
    first || list(ids),
    // Until migrate-014 runs: one count query per tab.
    ...(pc.error ? tabs.map((k) => SHOWS[k](lines('id, orders!inner(id)', { count: 'exact', head: true }, ids))) : []),
  ])
  const counts = pc.error ? Object.fromEntries(tabs.map((k, i) => [k, n[i].count ?? 0])) : pc.data
  const error = found?.error || listError

  const href = (p) => `/plant${Object.keys(p).length ? `?${new URLSearchParams(p)}` : ''}`
  const tabHref = (t) => href({ ...(t !== 'open' && { tab: t }), ...(term && { q: term }) })
  const params = { ...(tab !== 'open' && { tab }), ...(term && { q: term }) }
  const here = href(params)
  const isOpen = tab !== 'done'
  const boss = ['admin', 'manager'].includes(me.role)
  const exportParams = new URLSearchParams({ ...(tab !== 'open' ? { tab } : {}), ...(term ? { q: term } : {}) })

  return (
    <>
      <PageTabs group="production" on="/plant" label="Production" />
      <div className="card">
        <div className="tbl-top">
          <nav className="tabs tabs-dynamic mb-0" aria-label="Which lines">
            {Object.entries(TABS).map(([k, t]) => {
              const isActive = tab === k
              const count = counts[k] ?? 0
              return (
                <IntentLink
                  key={k}
                  href={tabHref(k)}
                  className={`tab${isActive ? ' on' : ''}`}
                  aria-current={isActive ? 'page' : undefined}
                  title={`${t.label} (${count})`}
                  aria-label={`${t.label} (${count})`}
                >
                  <LinkBusy />
                  <i className={`ph ${t.icon}`} />
                  <span className="tab-txt">{t.label}</span>
                  <span className="badge b-none">{count}</span>
                </IntentLink>
              )
            })}
          </nav>
          <div className="tbl-filters">
            <form className="sw">
              {tab !== 'open' && <input type="hidden" name="tab" value={tab} />}
              <i className="ph ph-magnifying-glass" />
              <input className="tsearch" name="q" defaultValue={term} placeholder="Quote no, customer, material…" aria-label="Search plant lines" />
            </form>
            {boss && (
              <a className="btn btn-ghost btn-sm" href={`/admin/export/lines?${exportParams}`}>
                <i className="ph ph-download-simple" />Export
              </a>
            )}
          </div>
        </div>

        {error && (
          <div className="banner error" style={{ margin: '0 20px 16px' }} title={error.message}>
            <i className="ph ph-warning-circle" />Couldn't load the plant lines. Press Refresh to try again; if it keeps failing, tell the admin.
          </div>
        )}

        <PlantClient rows={rows?.map((r) => ({ ...r, fg_free: fg.on ? fg.pos[r.fg_item_id]?.free ?? 0 : null, fg_cap: fg.link }))} isOpen={isOpen} here={here} tab={tab} counts={counts} />

        {rows?.length === LIMIT && (
          <div className="tbl-foot center">
            <span className="muted text-sm">Showing the first {LIMIT} lines — search to narrow it down.</span>
          </div>
        )}
      </div>
    </>
  )
}
