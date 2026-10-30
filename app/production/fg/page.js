import { requireRole } from '@/lib/server'
import { invMasters, storeLabel } from '@/lib/inventory'
import { fgAsMaterials, fgItems, fgPosition, fgReport, prodMissing } from '@/lib/production'
import { day, money, qty, today } from '@/lib/tas'
import { Combobox, DateRange, FileDrop, Modal, ModalFoot } from '../../ui'
import { importFgOpening, postFgAdjustment } from '../actions'
import LinesForm from '../../inventory/LinesForm'
import ProdTabs from '../ProdTabs'

export const metadata = { title: 'Finished Goods Stock' }

// Finished goods per FG store and item (product + size): pieces, M2, and for the orders' store what is reserved.
export default async function FGStock({ searchParams }) {
  const sp = await searchParams
  const [, missing, { stores }, { rows, p, error }, items, pos] = await Promise.all([
    requireRole('manager'), prodMissing(), invMasters(), fgReport(sp), fgItems(), fgPosition(),
  ])
  const fgStores = stores.filter((s) => s.type === 'FG')
  const m2 = (r, k) => money(Number(r[k]) * Number(r.m2_per_pc))
  const total = (k) => rows.reduce((n, r) => n + Number(r[k]), 0)

  return (
    <>
      <ProdTabs tab="fg" missing={missing} />

      {error && !missing && (
        <div className="banner error">
          <i className="ph ph-warning-circle" />Couldn't load the FG stock. Press Refresh to try again; if it keeps failing, tell the admin.
        </div>
      )}
      {!fgStores.length && !missing && (
        <div className="banner warn">
          <i className="ph ph-warning" /><span>Add an FG store under Settings → Stores (type FG) for each plant.</span>
        </div>
      )}

      <div className="card">
        {/* ── Card Header: Title & Actions Toolbar ── */}
        <div className="tbl-top f-wrap gap-12">
          <div className="d-flex ai-c gap-8 f-wrap">
            <h2 className="tbl-ttl m-0">
              <i className="ph ph-stack" />Finished Goods Stock
              <span className="badge b-none">{rows.length}</span>
            </h2>
            {rows.length > 0 && (
              <span className="badge b-blue fw6">
                {qty(total('closing'))} pcs · {money(rows.reduce((n, r) => n + r.closing * r.m2_per_pc, 0))} M²
              </span>
            )}
          </div>

          <div className="tbl-filters d-flex ai-c gap-8 f-wrap">

            <Modal
              title="Load FG opening stock"
              icon="ph-upload-simple"
              label="Opening stock (CSV)"
              btnIcon="ph-upload-simple"
              btnClass="btn btn-ghost btn-sm"
            >
              <form action={importFgOpening}>
                <div className="modal-body">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 14px', background: 'var(--fill-2)', borderRadius: 8, border: '1px solid var(--border)', marginBottom: 12 }}>
                    <div>
                      <div className="fw6 text-sm d-flex ai-c gap-6">
                        <i className="ph ph-file-arrow-down" />
                        Pre-filled Finished Goods Template
                      </div>
                      <div className="muted text-xs mt-2">
                        Contains all 3,800 standard products with specs. Enter piece counts and upload.
                      </div>
                    </div>
                    <a href="/production/fg/export/template" download className="btn btn-secondary btn-sm f-no-shrink">
                      <i className="ph ph-file-arrow-down" />Download Template
                    </a>
                  </div>
                  <p>Save the Excel sheet as <b>CSV UTF-8</b> with the columns <b>store_code, brand, grade, color_code, color_name, core, skin, width, length, thickness, pcs</b> — the same values as on quotes.</p>
                  <p className="muted">Each product + size becomes an FG item (made once). A store + item that already has FG stock is refused, so the file can't be loaded twice.</p>
                  <div className="fg"><label htmlFor="odate">Opening date</label><input id="odate" name="date" type="date" defaultValue={today()} max={today()} required /></div>
                  <FileDrop name="file" accept=".csv,text/csv" hint="CSV, max 4 MB" maxMB={4} />
                </div>
                <ModalFoot label="Load" icon="ph-upload-simple" />
              </form>
            </Modal>

            <Modal
              title="FG Stock Adjustment"
              icon="ph-sliders-horizontal"
              label="Adjust stock"
              btnIcon="ph-sliders-horizontal"
              btnClass="btn btn-ghost btn-sm"
              size="large"
            >
              <div className="modal-body">
                <LinesForm
                  action={postFgAdjustment}
                  materials={fgAsMaterials(items)}
                  signed
                  title="FG items (pieces)"
                  submit={{ label: 'Post FG adjustment', icon: 'ph-check', cls: 'btn btn-primary' }}
                >
                  <div className="fgrid-2 mb-12">
                    <div className="fg">
                      <label htmlFor="store">FG store <span className="req">*</span></label>
                      <Combobox
                        id="store"
                        name="store"
                        defaultValue={fgStores.length === 1 ? String(fgStores[0].id) : ''}
                        placeholder="Select FG store…"
                        required
                        requiredMsg="Choose an FG store."
                        wide
                        options={fgStores.map((s) => ({
                          value: String(s.id),
                          label: storeLabel(s),
                          badge: s.type,
                        }))}
                      />
                    </div>
                    <div className="fg"><label htmlFor="date">Date</label><input id="date" name="date" type="date" defaultValue={today()} max={today()} required /></div>
                    <div className="fg full"><label htmlFor="reason">Reason <span className="req">*</span></label><input id="reason" name="reason" required placeholder="Stock count difference, damaged in store…" /></div>
                  </div>
                </LinesForm>
              </div>
            </Modal>
          </div>
        </div>

        {/* ── Cohesive Filter Bar integrated inside the Card ── */}
        {/* Same filter row as Raw material: store, search, period, Export */}
        <form action="/production/fg" className="tbl-filters fg-filters">
          <select name="store" defaultValue={p.store} aria-label="Filter by store" className="flt-sel">
            <option value="">All FG stores</option>
            {fgStores.map((s) => <option key={s.id} value={s.id}>{storeLabel(s)}</option>)}
          </select>

          <div className="sw">
            <i className="ph ph-magnifying-glass" />
            <input className="tsearch" name="q" defaultValue={p.q} placeholder="Item code, color or size…" aria-label="Search finished goods" />
          </div>

          <DateRange from={p.from} to={p.to} />

          <a className="btn btn-ghost btn-sm" href={`/production/fg/export?${p.qs}`}>
            <i className="ph ph-download-simple" />Export
          </a>

          {(p.q || p.store) && (
            <a href="/production/fg" className="btn-link text-xs danger ml-4">
              <i className="ph ph-x" />Reset
            </a>
          )}
        </form>

        {/* ── Main Stock Table ── */}
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Store</th>
                <th>Item (product + size)</th>
                <th className="r">Opening</th>
                <th className="r">In</th>
                <th className="r">Out</th>
                <th className="r">Closing pcs</th>
                <th className="r">Closing M2</th>
                <th className="r">Reserved</th>
                <th className="r">Free</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const ps = pos[r.fg_item_id]
                return (
                  <tr key={`${r.store_id}-${r.fg_item_id}`}>
                    <td className="nowrap" data-label="Store">{r.store} <span className="muted">{r.plant_code}</span></td>
                    <td data-label="Item"><span className="mat-name">{r.code}</span><span className="mat-sub">{[r.color_name, r.b_grade && 'B-grade', `${money(r.m2_per_pc)} M2 / pc`].filter(Boolean).join(' · ')}</span></td>
                    <td className="num" data-label="Opening">{qty(r.opening)}</td>
                    <td className="num" data-label="In">{Number(r.inward) ? qty(r.inward) : <span className="muted">0</span>}</td>
                    <td className="num" data-label="Out">{Number(r.outward) ? qty(r.outward) : <span className="muted">0</span>}</td>
                    <td className="num fw6" data-label="Closing pcs">{qty(r.closing)}</td>
                    <td className="num" data-label="Closing M2">{m2(r, 'closing')}</td>
                    <td className="num" data-label="Reserved">{ps?.reserved ? qty(ps.reserved) : <span className="muted">—</span>}</td>
                    <td className={`num fw6${ps && ps.free < 0 ? ' red' : ''}`} data-label="Free">{ps ? qty(ps.free) : <span className="muted">—</span>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {!rows.length && (
            <div className="empty">
              <i className="ph ph-stack" />
              <h3>No finished goods here</h3>
              <p>Pieces arrive here after they are checked in QC, or load opening stock.</p>
            </div>
          )}
        </div>

        <div className="tbl-foot">
          <span className="muted text-sm">
            <i className="ph ph-info mr-4" />
            <b>Reserved</b> = pieces allocated to confirmed customer orders. <b>Free</b> = available finished stock for any order.
          </span>
        </div>
      </div>
    </>
  )
}
