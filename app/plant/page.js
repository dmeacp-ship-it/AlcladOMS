import Link from 'next/link'
import { db, requireRole } from '@/lib/server'
import { balanceOf, readyOf } from '@/lib/tas'
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
const ITEM = 'id, order_id, item_no, description, color_name, qty, width, length, price, delivered_qty, ready_qty, dispatched_qty, balance_qty, production_status, coil_date'
const ORDER = 'orders!inner(id, quote_no, doc_no, do_date, customer_name, status, dispatch_status)'
const LIMIT = 300

export const metadata = { title: 'Plant Dispatch' }

export default async function Plant({ searchParams }) {
  const me = await requireRole('plant')
  const sp = await searchParams
  const tab = TABS[sp.tab] ? sp.tab : 'open'
  const term = String(sp.q || '').replace(/[,()*%]/g, '').trim()

  // Query all approved order items
  let q = db().from('order_items').select(`${ITEM}, ${ORDER}`).eq('orders.status', 'APPROVED')
  if (term) q = q.or(`doc_no.ilike.%${term}%,quote_no.ilike.%${term}%,customer_name.ilike.%${term}%,description.ilike.%${term}%`, { referencedTable: 'orders' })

  const { data: allRows, error } = await q.order('order_id', { ascending: false }).order('item_no').limit(LIMIT)

  // Compute balance and ready state dynamically (safe against unmigrated balance_qty)
  const rowsWithBal = (allRows || []).map((it) => {
    const bal = balanceOf(it)
    const rQty = readyOf(it)
    const isReady = rQty > 0 && bal > 0
    const isDone = bal <= 0
    const isPartial = (Number(it.dispatched_qty) || 0) > 0 && bal > 0
    const isPending = (Number(it.dispatched_qty) || 0) === 0 && !isReady && bal > 0

    return {
      ...it,
      computed_balance: bal,
      computed_ready: rQty,
      is_ready: isReady,
      is_done: isDone,
      is_partial: isPartial,
      is_pending: isPending,
    }
  })

  const counts = {
    open: rowsWithBal.filter((r) => !r.is_done).length,
    ready: rowsWithBal.filter((r) => r.is_ready).length,
    pending: rowsWithBal.filter((r) => r.is_pending).length,
    partial: rowsWithBal.filter((r) => r.is_partial).length,
    done: rowsWithBal.filter((r) => r.is_done).length,
  }

  const rows = rowsWithBal.filter((r) => {
    if (tab === 'open') return !r.is_done
    if (tab === 'ready') return r.is_ready
    if (tab === 'pending') return r.is_pending
    if (tab === 'partial') return r.is_partial
    if (tab === 'done') return r.is_done
    return true
  })

  const params = { ...(tab !== 'open' && { tab }), ...(term && { q: term }) }
  const here = `/plant${Object.keys(params).length ? `?${new URLSearchParams(params)}` : ''}`
  const tabHref = (t) => `/plant?${new URLSearchParams({ ...(t !== 'open' && { tab: t }), ...(term && { q: term }) })}`
  const isOpen = tab !== 'done'

  return (
    <>
      <div className="stats">
        {Object.entries(TABS).map(([k, t]) => (
          <Link key={k} href={tabHref(k)} className={`stat${tab === k ? ' on' : ''}`}>
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

        <PlantClient rows={rows} isOpen={isOpen} here={here} />

        {rows?.length === LIMIT && (
          <div className="tbl-foot center">
            <span className="muted text-sm">Showing the first {LIMIT} lines — search to narrow it down.</span>
          </div>
        )}
      </div>
    </>
  )
}
