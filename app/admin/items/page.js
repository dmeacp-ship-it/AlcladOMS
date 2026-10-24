import { db, requireRole } from '@/lib/server'
import { ITEM_LISTS } from '@/lib/tas'
import { addItemValue, deleteItemValue, importItemLists } from '../actions'
import { FileDrop, Modal, ModalFoot } from '../../ui'

export const metadata = { title: 'Items' }

// Item master like the Google Sheet: one list per column. A quote line picks one value from each list;
// the combination (and its material description) is made on the order, not stored here.
export default async function Items() {
  await requireRole('admin')
  const { data, error } = await db().from('item_lists').select('id, list, value, name').order('value')
  const lists = Object.fromEntries(ITEM_LISTS.map((d) => [d.key, []]))
  for (const r of data || []) lists[r.list]?.push(r)
  for (const d of ITEM_LISTS) if (d.number) lists[d.key].sort((a, b) => a.value - b.value)

  const remove = (r, d) => (
    <form action={deleteItemValue}>
      <input type="hidden" name="id" value={r.id} />
      <button className="vchip-x" aria-label={`Remove ${d.label} ${r.value}`} title="Remove"><i className="ph ph-x" /></button>
    </form>
  )
  const add = (d) => (
    <form action={addItemValue} className="vadd">
      <input type="hidden" name="list" value={d.key} />
      <input name="value" required aria-label={`New ${d.label}`} placeholder={d.nameHeader ? 'Code, e.g. AL4001' : d.number ? 'e.g. 1250' : `New ${d.label.toLowerCase()}`}
        {...(d.number && { type: 'number', min: 0, step: 'any' })} />
      {d.nameHeader && <input name="name" required aria-label="Color name" placeholder="Name, e.g. Industrial Ash" />}
      <button className="btn btn-ghost btn-sm"><i className="ph ph-plus" />Add</button>
    </form>
  )

  return (
    <>
      <div className="card">
        <div className="tbl-top">
          <h2 className="tbl-ttl"><i className="ph ph-cube" />Item master <span className="hint">— one list per column; quotes combine them</span></h2>
          <div className="tbl-filters">
            <a className="btn btn-ghost btn-sm" href="/admin/export/items-template"><i className="ph ph-file-arrow-down" />Template</a>
            <a className="btn btn-ghost btn-sm" href="/admin/export/items"><i className="ph ph-download-simple" />Export</a>
            <Modal title="Upload item master" icon="ph-upload-simple" label="Upload CSV" btnIcon="ph-upload-simple" btnClass="btn btn-primary btn-sm">
              <form action={importItemLists}>
                <div className="modal-body">
                  <p>Same layout as the Google Sheet: one column per list, values going down. Save it as <b>CSV UTF-8</b>. Columns:</p>
                  <p className="muted">{ITEM_LISTS.flatMap((d) => [d.header, d.nameHeader].filter(Boolean)).join(', ')}</p>
                  <div className="banner warn"><i className="ph ph-warning" /><span>This <b>replaces every list</b> with the file. Existing orders don't change.</span></div>
                  <FileDrop name="file" accept=".csv,text/csv" hint="CSV, max 4 MB" />
                  <a href="/admin/export/items-template"><i className="ph ph-file-arrow-down" /> Download the template</a>
                </div>
                <ModalFoot label="Replace item master" icon="ph-upload-simple" />
              </form>
            </Modal>
          </div>
        </div>
        {error && <div className="banner error" style={{ margin: '0 20px 16px' }} title={error.message}><i className="ph ph-warning-circle" />Couldn't load the item lists. Run migrate-010.sql in Supabase, then refresh.</div>}
      </div>

      <div className="lists-grid">
        {ITEM_LISTS.map((d) => (
          <section key={d.key} className={`fsec list-card${d.nameHeader ? ' wide' : ''}`}>
            <h2 className="fsec-ttl">{d.label} <span className="badge b-none">{lists[d.key].length}</span></h2>
            {d.nameHeader ? (
              <div className="tbl-wrap color-list">
                <table className="tbl">
                  <thead><tr><th>Code</th><th>Name</th><th className="r"><span className="sr-only">Remove</span></th></tr></thead>
                  <tbody>
                    {lists[d.key].map((r) => (
                      <tr key={r.id}><td className="fw6 nowrap">{r.value}</td><td>{r.name}</td><td className="r">{remove(r, d)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="vchips">
                {lists[d.key].map((r) => <span key={r.id} className="vchip">{r.value}{remove(r, d)}</span>)}
                {!lists[d.key].length && <span className="muted text-sm">No values yet.</span>}
              </div>
            )}
            {add(d)}
          </section>
        ))}
      </div>
    </>
  )
}
