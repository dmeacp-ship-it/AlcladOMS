import Link from 'next/link'
import { requireRole } from '@/lib/server'
import { invMasters, isLow, stockReport, storeLabel } from '@/lib/inventory'
import { day, qty } from '@/lib/tas'
import { IntentLink, LinkBusy } from '../ui'
import InvTabs from './InvTabs'

export const metadata = { title: 'Inventory' }

// Stock per store and material for a period: opening, in, out, closing. Red = below the material's min level.
export default async function Stock({ searchParams }) {
  const sp = await searchParams
  const [, { missing, plants, stores }, { rows, p, error, totalCount, lowCount }] = await Promise.all([
    requireRole('manager'),
    invMasters(),
    stockReport(sp),
  ])

  const href = (params) => {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== ''))
    const qs = q.toString()
    return `/inventory${qs ? `?${qs}` : ''}`
  }

  // Preserve current filters when toggling tabs
  const baseParams = {
    from: p.from,
    to: p.to,
    plant: p.plant,
    store: p.store,
    q: p.q,
  }

  const hasCustomDates = Boolean(p.plant) || p.from !== `${p.to.slice(0, 8)}01`
  const isAll = !p.low

  return (
    <>
      <InvTabs tab="" missing={missing} />

      {error && !missing && (
        <div className="banner error" style={{ marginBottom: 16 }}>
          <i className="ph ph-warning-circle" />
          Couldn't load the stock. Press Refresh to try again; if it keeps failing, tell the admin.
        </div>
      )}

      <div className="card">
        {/* Unified Card Header Toolbar */}
        <div className="tbl-top">
          {/* Quick Filter Tabs (Dynamic Expandable) */}
          <nav className="tabs tabs-dynamic" aria-label="Filter stock by level" style={{ marginBottom: 0 }}>
            <IntentLink
              href={href({ ...baseParams, low: '' })}
              className={`tab${isAll ? ' on' : ''}`}
              aria-current={isAll ? 'page' : undefined}
              title={`All Materials (${totalCount ?? rows.length})`}
              aria-label={`All Materials (${totalCount ?? rows.length})`}
            >
              <LinkBusy />
              <i className="ph ph-warehouse" />
              <span className="tab-txt">All Materials</span>
              <span className="badge b-none">{totalCount ?? rows.length}</span>
            </IntentLink>

            <IntentLink
              href={href({ ...baseParams, low: '1' })}
              className={`tab${p.low ? ' on' : ''}`}
              aria-current={p.low ? 'page' : undefined}
              title={`Below Minimum (${lowCount ?? 0})`}
              aria-label={`Below Minimum (${lowCount ?? 0})`}
            >
              <LinkBusy />
              <i className="ph ph-warning" style={{ color: (lowCount ?? 0) > 0 ? 'var(--red)' : 'inherit' }} />
              <span className="tab-txt">Below Minimum</span>
              <span className={`badge ${(lowCount ?? 0) > 0 ? 'b-bad' : 'b-none'}`}>
                {lowCount ?? 0}
              </span>
            </IntentLink>
          </nav>

          {/* Integrated Filter Controls */}
          <form action="/inventory" method="GET" className="tbl-filters">
            {p.low && <input type="hidden" name="low" value="1" />}

            {/* Store Select */}
            <select name="store" defaultValue={p.store} className="flt-sel" aria-label="Filter by store">
              <option value="">All stores</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>{storeLabel(s)}</option>
              ))}
            </select>

            {/* Material Search Input */}
            <div className="sw">
              <i className="ph ph-magnifying-glass" />
              <input
                className="tsearch"
                name="q"
                defaultValue={p.q}
                placeholder="Material code or name…"
                aria-label="Search materials"
              />
            </div>

            {/* Collapsible Date Range & Plant Filter Dropdown */}
            <details className="dl-menu q-menu">
              <summary
                className={`btn btn-sm ${hasCustomDates ? 'btn-primary' : 'btn-ghost'}`}
                title="Date range & plant filter"
                aria-label="Date range & plant filter"
              >
                <i className="ph ph-calendar-check" />
                <span className="q-label">{day(p.from)} – {day(p.to)}</span>
                <i className="ph ph-caret-down q-caret" />
              </summary>
              <div className="dl-list" style={{ minWidth: 260, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span className="text-xs fw6 muted">Date Range</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input type="date" name="from" defaultValue={p.from} style={{ flex: 1, fontSize: '0.8125rem' }} />
                    <span className="text-xs muted">to</span>
                    <input type="date" name="to" defaultValue={p.to} style={{ flex: 1, fontSize: '0.8125rem' }} />
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span className="text-xs fw6 muted">Plant</span>
                  <select name="plant" defaultValue={p.plant} className="flt-sel" style={{ width: '100%' }}>
                    <option value="">All plants</option>
                    {plants.map((x) => (
                      <option key={x.code} value={x.code}>{x.name}</option>
                    ))}
                  </select>
                </div>
                <button type="submit" className="btn btn-primary btn-sm" style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}>
                  Apply Filters
                </button>
              </div>
            </details>

            {/* Export CSV */}
            <a className="btn btn-ghost btn-sm" href={`/inventory/export?${p.qs}`} title="Download CSV">
              <i className="ph ph-download-simple" />Export
            </a>
          </form>
        </div>

        {/* Table Wrap */}
        <div className="tbl-wrap">
          {rows.length > 0 ? (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Store</th>
                  <th>Material</th>
                  <th>UoM</th>
                  <th className="r">Opening</th>
                  <th className="r">In</th>
                  <th className="r">Out</th>
                  <th className="r">Closing</th>
                  <th className="r">Min Level</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const lowStock = isLow(r)
                  return (
                    <tr key={`${r.store_id}-${r.material_id}`}>
                      <td className="nowrap">{r.store} <span className="muted">{r.plant_code}</span></td>
                      <td data-label="Material">
                        <span className="mat-name">{r.name}</span>
                        <span className="mat-sub">{r.code} · {r.category}</span>
                      </td>
                      <td data-label="UoM">{r.uom}</td>
                      <td className="num" data-label="Opening">{qty(r.opening)}</td>
                      <td className="num" data-label="In">{Number(r.inward) ? qty(r.inward) : <span className="muted">0</span>}</td>
                      <td className="num" data-label="Out">{Number(r.outward) ? qty(r.outward) : <span className="muted">0</span>}</td>
                      <td className={`num fw6${lowStock ? ' red' : ''}`} data-label="Closing">
                        {qty(r.closing)}
                        {lowStock && <span className="badge b-bad" style={{ marginLeft: 6, fontSize: '0.6875rem' }}>Low</span>}
                      </td>
                      <td className="num muted" data-label="Min level">
                        {r.min_level != null && !r.wip ? qty(r.min_level) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ) : (
            <div className="empty" style={{ padding: '52px 20px', textAlign: 'center' }}>
              <i className="ph ph-warehouse" style={{ fontSize: '2.5rem', color: 'var(--muted)', marginBottom: 10, display: 'inline-block' }} />
              <h3 style={{ margin: '0 0 6px', fontSize: '1.0625rem', fontWeight: 700 }}>
                {p.low ? 'No low stock materials' : 'No materials found'}
              </h3>
              <p className="muted text-sm" style={{ margin: '0 auto 16px', maxWidth: 420 }}>
                {p.low ? (
                  <>All materials in this selection are currently above minimum safety stock levels.</>
                ) : p.q ? (
                  <>No materials matched &ldquo;{p.q}&rdquo;.</>
                ) : (
                  <>Stock appears once opening stock is loaded or goods pass QC.</>
                )}
              </p>
              {p.low && (
                <Link prefetch={false} href={href({ ...baseParams, low: '' })} className="btn btn-ghost btn-sm">
                  View All Materials ({totalCount ?? 0}) →
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
