import Link from 'next/link'
import { LinkBusy } from '../ui'
import { db, requireRole } from '@/lib/server'
import { fgPosition } from '@/lib/production'
import { getSettings } from '@/lib/settings'
import PlantClient from './PlantClient'

// Plant dispatch (FMS plant screen): every approved order line in 1 flat row.
// The plant marks items ready (partial/full), sets plant status, and generates Delivery Orders.
const TABS = {
  open: { label: 'Open', icon: 'ph-factory', cls: 'ca' },
  ready: { label: 'Ready', icon: 'ph-check-square-offset', cls: 'cg' },
  pending: { label: 'Pending', icon: 'ph-hourglass', cls: 'co' },
  partial: { label: 'Partial', icon: 'ph-circle-half', cls: 'co' },
  done: { label: 'Dispatched', icon: 'ph-check-circle', cls: 'cg' },
}
const ITEM = 'id, order_id, item_no, fg_item_id, description, color_name, qty, width, length, price, delivered_qty, ready_qty, dispatched_qty, balance_qty, production_status, coil_date'
const ORDER = 'orders!inner(id, quote_no, doc_no, do_date, customer_name, status, dispatch_status)'
const LIMIT = 300

export const metadata = { title: 'Plant Dispatch' }

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
  const [, found, pc, first, fg] = await Promise.all([
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

  const params = { ...(tab !== 'open' && { tab }), ...(term && { q: term }) }
  const here = `/plant${Object.keys(params).length ? `?${new URLSearchParams(params)}` : ''}`
  const tabHref = (t) => `/plant?${new URLSearchParams({ ...(t !== 'open' && { tab: t }), ...(term && { q: term }) })}`
  const isOpen = tab !== 'done'

  return (
    <>
      <div className="stats">
        {Object.entries(TABS).map(([k, t]) => (
          <Link prefetch={false} key={k} href={tabHref(k)} className={`stat${tab === k ? ' on' : ''}`}>
            <LinkBusy />
            <i className={`ph ${t.icon} stat-ic ${t.cls}`} />
            <div className={`stat-n ${t.cls}`}>{counts[k] ?? 0}</div>
            <div className="stat-l">{t.label} lines</div>
          </Link>
        ))}
      </div>

      <div className="card">
        <div className="tbl-top">
          <h2 className="tbl-ttl">
            <i className="ph ph-factory" />{TABS[tab].label} lines
            <span className="badge b-none">{counts[tab] ?? 0}</span>
          </h2>
          <form className="tbl-filters">
            {tab !== 'open' && <input type="hidden" name="tab" value={tab} />}
            <div className="sw">
              <i className="ph ph-magnifying-glass" />
              <input className="tsearch" name="q" defaultValue={term} placeholder="Quote no, customer, material…" aria-label="Search plant lines" />
            </div>
          </form>
        </div>

        {error && (
          <div className="banner error" style={{ margin: '0 20px 16px' }}>
            <i className="ph ph-warning-circle" />Couldn't load the plant lines. Press Refresh to try again; if it keeps failing, tell the admin.
          </div>
        )}

        <PlantClient rows={rows?.map((r) => ({ ...r, fg_free: fg.on ? fg.pos[r.fg_item_id]?.free ?? 0 : null, fg_cap: fg.link }))} isOpen={isOpen} here={here} />

        {rows?.length === LIMIT && (
          <div className="tbl-foot center">
            <span className="muted text-sm">Showing the first {LIMIT} lines — search to narrow it down.</span>
          </div>
        )}
      </div>
    </>
  )
}
