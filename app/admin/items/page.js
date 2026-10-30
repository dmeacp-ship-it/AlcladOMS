import { db, requireRole } from '@/lib/server'
import { ITEM_LISTS } from '@/lib/tas'
import { addItemValue, deleteItemValue, importItemLists } from '../actions'
import { ChipFilter, ConfirmButton, FileDrop, Modal, ModalFoot } from '../../ui'

export const metadata = { title: 'Items' }

// Item master like the Google Sheet: one list per column. A quote line picks one value from each list;
// the combination (and its material description) is made on the order, not stored here.
export default async function Items() {
  await requireRole('admin')
  const { data, error } = await db().from('item_lists').select('id, list, value, name').order('value')
  const lists = Object.fromEntries(ITEM_LISTS.map((d) => [d.key, []]))
  for (const r of data || []) lists[r.list]?.push(r)
  for (const d of ITEM_LISTS) if (d.number) lists[d.key].sort((a, b) => a.value - b.value)

  // Asks first: a removed value can't be picked on new quotes until it is added again.
  const remove = (r, d) => (
    <form action={deleteItemValue}>
      <input type="hidden" name="id" value={r.id} />
      <ConfirmButton className="vchip-x" aria-label={`Remove ${d.label} ${r.value}`} title="Remove"
        message={`Remove ${d.label} ${r.value}${r.name ? ` (${r.name})` : ''}? New quotes can't use it until it is added again. Existing orders keep it.`}>
        <i className="ph ph-x" />
      </ConfirmButton>
    </form>
  )
  const PLACEHOLDER = { skin: 'e.g. 0.5', width: 'e.g. 1250', length: 'e.g. 5600', thickness: 'e.g. 4' }
  const add = (d) => (
    <form action={addItemValue} className="vadd">
      <input type="hidden" name="list" value={d.key} />
      <input name="value" required aria-label={`New ${d.label}`} placeholder={d.nameHeader ? 'Code, e.g. AL4001' : PLACEHOLDER[d.key] || `New ${d.label.toLowerCase()}`}
        {...(d.number && { type: 'number', inputMode: 'decimal', min: 0, step: 'any' })} />
      {d.nameHeader && <input name="name" required aria-label="Color name" placeholder="Name, e.g. Industrial Ash" />}
      <button className="btn btn-ghost btn-sm"><i className="ph ph-plus" />Add</button>
    </form>
  )

  return (
    <>
      <div className="card">
        <div className="tbl-top">
          <h2 className="tbl-ttl"><i className="ph ph-cube" />Item master <span className="hint">one list per column; quotes combine them</span></h2>
          <div className="tbl-filters">
            <a className="btn btn-ghost btn-sm" href="/admin/export/items" title="Export all item lists as CSV"><i className="ph ph-download-simple" />Export CSV</a>
            <Modal title="Bulk Upload / Update Items" icon="ph-upload-simple" label="Bulk Upload / Update" btnIcon="ph-upload-simple" btnClass="btn btn-ghost btn-sm">
              <form action={importItemLists}>
                <div className="modal-body">
                  <p><b>Add or update item lists in bulk</b> (Brands, Colors, Grades, Cores, Sizes, UoM).</p>
                  <p>By default, values in the file are <b>merged and updated</b> without deleting existing values. If a color code already exists, its color name is updated. New values are added.</p>
                  <div style={{ display: 'flex', gap: '8px', margin: '12px 0 16px', flexWrap: 'wrap' }}>
                    <a className="btn btn-ghost btn-sm" href="/admin/export/items-template">
                      <i className="ph ph-file-arrow-down" />Download Template (CSV)
                    </a>
                    <a className="btn btn-ghost btn-sm" href="/admin/export/items">
                      <i className="ph ph-download-simple" />Export Current Items (CSV)
                    </a>
                  </div>
                  <div style={{ marginBottom: '12px' }}>
                    <span className="muted text-sm">Columns: {ITEM_LISTS.flatMap((d) => [d.header, d.nameHeader].filter(Boolean)).join(', ')}</span>
                  </div>
                  <FileDrop name="file" accept=".csv,text/csv" hint="CSV UTF-8, max 4 MB" maxMB={4} />
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '16px', fontSize: '0.8125rem', cursor: 'pointer', color: 'var(--sub)' }}>
                    <input type="checkbox" name="replace" value="1" />
                    <span><b>Replace entire item master</b> (caution: wipes existing lists before inserting)</span>
                  </label>
                </div>
                <ModalFoot label="Upload & Update" icon="ph-upload-simple" />
              </form>
            </Modal>
          </div>
        </div>
        {error && <div className="banner error" style={{ margin: '0 20px 16px' }} title={error.message}><i className="ph ph-warning-circle" />Couldn't load the item lists. Press Refresh to try again; if it keeps failing, tell the admin.</div>}
      </div>

      {/* Colour (long, two fields) on the left; the eight short lists in an even grid on the right */}
      <div className="items-layout">
        {[ITEM_LISTS.filter((d) => d.nameHeader), ITEM_LISTS.filter((d) => !d.nameHeader)].map((group, gi) => (
        <div key={gi} className={gi ? 'lists-grid' : 'lists-main'}>
        {group.map((d) => (
          <section key={d.key} className={`fsec list-card${d.nameHeader ? ' wide' : ''}`}>
            <h2 className="fsec-ttl">{d.label} <span className="badge b-none">{lists[d.key].length}</span></h2>
            {d.nameHeader && <ChipFilter target={`list-${d.key}`} label={`Find a ${d.label.toLowerCase()} code or name`} />}
            <div className="vchips" id={`list-${d.key}`}>
              {lists[d.key].map((r) => (
                <span key={r.id} className="vchip">{r.value}{r.name && <span className="vchip-name">{r.name}</span>}{remove(r, d)}</span>
              ))}
              {!lists[d.key].length && <span className="muted text-sm">No values yet.</span>}
            </div>
            {add(d)}
          </section>
        ))}
        </div>
        ))}
      </div>
    </>
  )
}
