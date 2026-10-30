import Link from 'next/link'
import { requireRole } from '@/lib/server'
import { invMasters, isLow, stockReport, storeLabel } from '@/lib/inventory'
import { day, qty, today } from '@/lib/tas'
import { Combobox, DateRange, FileDrop, IntentLink, LinkBusy, Modal, ModalFoot } from '../ui'
import { importOpening, postAdjustment } from './actions'
import LinesForm from './LinesForm'
import InvTabs from './InvTabs'

export const metadata = { title: 'Inventory' }

// Stock per store and material for a period: opening, in, out, closing. Red = below the material's min level.
export default async function Stock({ searchParams }) {
  const sp = await searchParams
  const [, { missing, plants, stores, materials }, { rows, p, error, totalCount, lowCount }] = await Promise.all([
    requireRole('manager'),
    invMasters(),
    stockReport(sp),
  ])

  const rmStores = stores.filter((s) => s.type !== 'FG')

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

  const isAll = !p.low

  return (
    <>
      <InvTabs tab="" missing={missing} />

      {error && !missing && (
        <div className="banner error mb-16">
          <i className="ph ph-warning-circle" />
          Couldn't load the stock. Press Refresh to try again; if it keeps failing, tell the admin.
        </div>
      )}

      <div className="card">
        {/* Unified Card Header Toolbar */}
        <div className="tbl-top">
          {/* Quick Filter Tabs (Dynamic Expandable) */}
          <nav className="tabs tabs-dynamic mb-0" aria-label="Filter stock by level">
            <IntentLink
              href={href({ ...baseParams, low: '' })}
              className={`tab${isAll ? ' on' : ''}`}
              aria-current={isAll ? 'page' : undefined}
              title={`All materials (${totalCount ?? rows.length})`}
              aria-label={`All materials (${totalCount ?? rows.length})`}
            >
              <LinkBusy />
              <i className="ph ph-warehouse" />
              <span className="tab-txt">All materials</span>
              <span className="badge b-none">{totalCount ?? rows.length}</span>
            </IntentLink>

            <IntentLink
              href={href({ ...baseParams, low: '1' })}
              className={`tab${p.low ? ' on' : ''}`}
              aria-current={p.low ? 'page' : undefined}
              title={`Below minimum (${lowCount ?? 0})`}
              aria-label={`Below minimum (${lowCount ?? 0})`}
            >
              <LinkBusy />
              <i className="ph ph-warning" style={{ color: (lowCount ?? 0) > 0 ? 'var(--red)' : 'inherit' }} />
              <span className="tab-txt">Below minimum</span>
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

            <DateRange from={p.from} to={p.to}>
              <label className="dr-extra">Plant
                <select name="plant" defaultValue={p.plant} className="flt-sel">
                  <option value="">All plants</option>
                  {plants.map((x) => <option key={x.code} value={x.code}>{x.name}</option>)}
                </select>
              </label>
            </DateRange>

            {/* Export CSV */}
            <a className="btn btn-ghost btn-sm" href={`/inventory/export?${p.qs}`} title="Download CSV">
              <i className="ph ph-download-simple" />Export
            </a>
          </form>

          {/* Action Modals: Opening Stock & Stock Adjustment */}
          <div className="d-flex ai-c gap-8 f-wrap">
            <Modal
              title="Load Raw Material Opening Stock"
              icon="ph-upload-simple"
              label="Opening stock (CSV)"
              btnIcon="ph-upload-simple"
              btnClass="btn btn-ghost btn-sm"
            >
              <form action={importOpening}>
                <input type="hidden" name="back" value="/inventory" />
                <div className="modal-body">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 14px', background: 'var(--fill-2)', borderRadius: 8, border: '1px solid var(--border)', marginBottom: 12 }}>
                    <div>
                      <div className="fw6 text-sm d-flex ai-c gap-6">
                        <i className="ph ph-file-arrow-down" />
                        Pre-filled Raw Materials Template
                      </div>
                      <div className="muted text-xs mt-2">
                        Contains all 2,203 active factory coils, granules &amp; films. Enter quantities and upload.
                      </div>
                    </div>
                    <a href="/inventory/export/template" download className="btn btn-secondary btn-sm f-no-shrink">
                      <i className="ph ph-file-arrow-down" />Download Template
                    </a>
                  </div>
                  <p>Save the Excel sheet as <b>CSV UTF-8</b> with the columns <b>store_code, material_code, qty</b>.</p>
                  <p className="muted">The store must exist under Settings → Stores, and the material under Settings → Materials. A store + material that already has entries is refused, so the file can't be loaded twice.</p>
                  <div className="fg">
                    <label htmlFor="rm-odate">Opening date</label>
                    <input id="rm-odate" name="date" type="date" defaultValue={today()} max={today()} required />
                  </div>
                  <FileDrop name="file" accept=".csv,text/csv" hint="CSV, max 4 MB" maxMB={4} />
                </div>
                <ModalFoot label="Load" icon="ph-upload-simple" />
              </form>
            </Modal>

            <Modal
              title="Raw Material Stock Adjustment"
              icon="ph-sliders-horizontal"
              label="Adjust stock"
              btnIcon="ph-sliders-horizontal"
              btnClass="btn btn-ghost btn-sm"
              size="large"
            >
              <div className="modal-body">
                <LinesForm
                  action={postAdjustment}
                  materials={materials}
                  signed
                  title="Raw Materials & Consumables"
                  submit={{ label: 'Post adjustment', icon: 'ph-check', cls: 'btn btn-primary' }}
                >
                  <input type="hidden" name="back" value="/inventory" />
                  <div className="fgrid-2 mb-12">
                    <div className="fg">
                      <label htmlFor="adj-store">Store / Production Line <span className="req">*</span></label>
                      <Combobox
                        id="adj-store"
                        name="store"
                        defaultValue={rmStores.length === 1 ? String(rmStores[0].id) : ''}
                        placeholder="Select store or production line…"
                        required
                        requiredMsg="Choose a store."
                        wide
                        options={rmStores.map((s) => ({
                          value: String(s.id),
                          label: storeLabel(s),
                          badge: s.type,
                        }))}
                      />
                    </div>
                    <div className="fg"><label htmlFor="adj-date">Date</label><input id="adj-date" name="date" type="date" defaultValue={today()} max={today()} required /></div>
                    <div className="fg full"><label htmlFor="adj-reason">Reason <span className="req">*</span></label><input id="adj-reason" name="reason" required placeholder="Physical count difference, scrap correction, damaged in store…" /></div>
                  </div>
                </LinesForm>
              </div>
            </Modal>
          </div>
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
                        {lowStock && <span className="badge b-bad" style={{ marginLeft: 6, fontSize: '0.75rem' }}>Low</span>}
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
              <h3 style={{ margin: '0 0 6px', fontSize: '1rem', fontWeight: 700 }}>
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
