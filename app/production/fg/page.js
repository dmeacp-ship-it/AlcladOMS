import { requireRole } from '@/lib/server'
import { invMasters, storeLabel } from '@/lib/inventory'
import { fgAsMaterials, fgItems, fgPosition, fgReport, prodMissing } from '@/lib/production'
import { day, money, qty, today } from '@/lib/tas'
import { Combobox, FileDrop, Modal, ModalFoot } from '../../ui'
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
      <form className="page-head" action="/production/fg">
        <div className="row">
          <label htmlFor="from" className="sub">From</label>
          <input id="from" type="date" name="from" defaultValue={p.from} style={{ width: 160 }} />
          <label htmlFor="to" className="sub">to</label>
          <input id="to" type="date" name="to" defaultValue={p.to} style={{ width: 160 }} />
          <select name="store" defaultValue={p.store} aria-label="FG store" className="flt-sel">
            <option value="">All FG stores</option>
            {fgStores.map((s) => <option key={s.id} value={s.id}>{storeLabel(s)}</option>)}
          </select>
          <input name="q" defaultValue={p.q} placeholder="Item code or colour…" aria-label="Search FG items" style={{ width: 200 }} />
          <button className="btn btn-ghost btn-sm"><i className="ph ph-check" />Apply</button>
        </div>
        <div className="acts">
          <a className="btn btn-ghost btn-sm" href={`/production/fg/export?${p.qs}`}><i className="ph ph-download-simple" />Download CSV</a>
          <Modal title="Load FG opening stock" icon="ph-upload-simple" label="Load opening stock (CSV)" btnIcon="ph-upload-simple" btnClass="btn btn-ghost btn-sm">
            <form action={importFgOpening}>
              <div className="modal-body">
                <p>Save the Excel sheet as <b>CSV UTF-8</b> with the columns <b>store_code, brand, grade, color_code, color_name, core, skin, width, length, thickness, pcs</b> — the same values as on quotes.</p>
                <p className="muted">Each product + size becomes an FG item (made once). A store + item that already has FG stock is refused, so the file can't be loaded twice.</p>
                <div className="fg"><label htmlFor="odate">Opening date</label><input id="odate" name="date" type="date" defaultValue={today()} max={today()} required /></div>
                <FileDrop name="file" accept=".csv,text/csv" hint="CSV, max 4 MB" maxMB={4} />
              </div>
              <ModalFoot label="Load" icon="ph-upload-simple" />
            </form>
          </Modal>
        </div>
      </form>

      {error && !missing && <div className="banner error"><i className="ph ph-warning-circle" />Couldn't load the FG stock. Press Refresh to try again; if it keeps failing, tell the admin.</div>}
      {!fgStores.length && !missing && <div className="banner warn"><i className="ph ph-warning" /><span>Add an FG store under Settings → Stores (type FG) for each plant.</span></div>}

      <div className="card">
        <div className="tbl-top">
          <h2 className="tbl-ttl">
            <i className="ph ph-stack" />Finished goods {day(p.from)} – {day(p.to)} <span className="badge b-none">{rows.length}</span>
            {rows.length > 0 && <span className="badge b-blue">{qty(total('closing'))} pcs · {money(rows.reduce((n, r) => n + r.closing * r.m2_per_pc, 0))} M2</span>}
          </h2>
        </div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Store</th><th>Item (product + size)</th><th className="r">Opening</th><th className="r">In</th><th className="r">Out</th><th className="r">Closing pcs</th><th className="r">Closing M2</th><th className="r">Reserved</th><th className="r">Free</th></tr></thead>
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
          {!rows.length && <div className="empty"><i className="ph ph-stack" /><h3>No finished goods here</h3><p>Pieces arrive here after they are checked, or load the starting stock.</p></div>}
        </div>
        <div className="tbl-foot"><span className="muted text-sm">Reserved = marked ready for an order. Free = can go to any order.</span></div>
      </div>

      <div style={{ marginTop: 20 }}>
        <LinesForm action={postFgAdjustment} materials={fgAsMaterials(items)} signed title="FG items (pieces)" submit={{ label: 'Post FG adjustment', icon: 'ph-check' }}>
          <h2 className="fsec-ttl"><i className="ph ph-sliders-horizontal" />FG stock adjustment (pieces)</h2>
          <div className="fgrid-2">
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
    </>
  )
}
