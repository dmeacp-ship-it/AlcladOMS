import { db, requireRole } from '@/lib/server'
import { invMasters, storeLabel } from '@/lib/inventory'
import { day, qty, today } from '@/lib/tas'
import { Combobox, FileDrop, Modal, ModalFoot } from '../../ui'
import { importOpening, postAdjustment } from '../actions'
import InvTabs from '../InvTabs'
import LinesForm from '../LinesForm'

export const metadata = { title: 'Stock Correction' }

// Go-live opening stock (CSV, once per store + material) and later corrections with a reason.
export default async function Adjust() {
  const [, { missing, stores, materials }, { data: recent }] = await Promise.all([
    requireRole('manager'),
    invMasters(),
    db().from('stock_moves').select('*, store:stores(name, plant_code), m:materials(code, name, uom)')
      .in('ref_type', ['OPENING', 'ADJUST']).order('id', { ascending: false }).limit(100),
  ])
  return (
    <>
      <InvTabs tab="adjust" missing={missing} />
      <div className="page-head">
        <span className="muted text-sm"><i className="ph ph-info" /> Load the opening stock once at go-live; after that, correct differences from a stock count with an adjustment.</span>
        <div className="acts">
          <Modal title="Load opening stock" icon="ph-upload-simple" label="Load opening stock (CSV)" btnIcon="ph-upload-simple" btnClass="btn btn-ghost btn-sm">
            <form action={importOpening}>
              <div className="modal-body">
                <p>Save the Excel sheet as <b>CSV UTF-8</b> with the columns <b>store_code, material_code, qty</b> (codes as in the Stores and Materials masters).</p>
                <p className="muted">A store + material that already has stock entries is refused, so the file can't be loaded twice.</p>
                <div className="fg"><label htmlFor="odate">Opening date</label><input id="odate" name="date" type="date" defaultValue={today()} max={today()} required /></div>
                <FileDrop name="file" accept=".csv,text/csv" hint="CSV, max 4 MB" maxMB={4} />
              </div>
              <ModalFoot label="Load" icon="ph-upload-simple" />
            </form>
          </Modal>
        </div>
      </div>

      <LinesForm action={postAdjustment} materials={materials} signed submit={{ label: 'Post adjustment', icon: 'ph-check' }}>
        <h2 className="fsec-ttl"><i className="ph ph-sliders-horizontal" />Stock adjustment</h2>
        <div className="fgrid-2">
          <div className="fg">
            <label htmlFor="store">Store <span className="req">*</span></label>
            <Combobox
              id="store"
              name="store"
              placeholder="Select store…"
              required
              requiredMsg="Choose a store."
              wide
              options={stores.map((s) => ({
                value: String(s.id),
                label: storeLabel(s),
                badge: s.type,
              }))}
            />
          </div>
          <div className="fg"><label htmlFor="date">Date</label><input id="date" name="date" type="date" defaultValue={today()} max={today()} required /></div>
          <div className="fg full"><label htmlFor="reason">Reason <span className="req">*</span></label><input id="reason" name="reason" required placeholder="Stock count difference, damaged, found in store…" /></div>
        </div>
      </LinesForm>

      <div className="card" style={{ marginTop: 20 }}>
        <div className="tbl-top"><h2 className="tbl-ttl"><i className="ph ph-clock-counter-clockwise" />Latest openings &amp; adjustments</h2></div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Ref</th><th>Date</th><th>Store</th><th>Material</th><th className="r">Qty</th><th>Reason / file</th><th>By</th></tr></thead>
            <tbody>
              {recent?.map((v) => (
                <tr key={v.id}>
                  <td className="nowrap">{v.ref_no}</td>
                  <td className="nowrap" data-label="Date">{day(v.move_date)}</td>
                  <td data-label="Store">{storeLabel(v.store)}</td>
                  <td data-label="Material"><span className="mat-name">{v.m.name}</span><span className="mat-sub">{v.m.code}</span></td>
                  <td className={`num fw6${v.qty < 0 ? ' red' : ''}`} data-label="Qty">{v.qty > 0 ? '+' : ''}{qty(v.qty)} {v.m.uom}</td>
                  <td data-label="Reason">{v.note || <span className="muted">—</span>}</td>
                  <td data-label="By">{v.by_name}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!recent?.length && <div className="empty"><i className="ph ph-sliders-horizontal" /><h3>Nothing yet</h3><p>Start by loading the opening stock.</p></div>}
        </div>
      </div>
    </>
  )
}
