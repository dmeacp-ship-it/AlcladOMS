import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db, requireRole } from '@/lib/server'
import { MASTERS } from '@/lib/tas'
import { importMaster, saveMaster } from '../actions'
import { FileDrop, LinkBusy, Modal, ModalFoot } from '../../ui'
import MasterFields, { MasterTable } from './MasterFields'

const PAGE = 50

export async function generateMetadata({ params }) {
  return { title: MASTERS[(await params).master]?.title }
}

// Customers and the inventory masters: search, paging, add / edit / delete in dialogs.
export default async function Master({ params, searchParams }) {
  await requireRole('admin')
  const { master } = await params
  const cfg = MASTERS[master]
  if (!cfg) notFound()
  const sp = await searchParams
  const page = Math.max(0, parseInt(sp.page) || 0)
  const term = String(sp.q || '').trim()
  const sort = ['name', 'code'].includes(sp.sort) ? sp.sort : 'id'
  const isCust = master === 'customers'
  // Stores: production lines (type WIP) hold stock too, so they live in the same table, shown on their own tab.
  const isStores = master === 'stores'
  const lines = isStores && sp.kind === 'lines'
  const kind = (q, l = lines) => (!isStores ? q : l ? q.eq('type', 'WIP') : q.neq('type', 'WIP'))
  const one = lines ? 'Production line' : cfg.title.slice(0, -1)

  let q = kind(db().from(master).select(isCust ? '*, sp:profiles(full_name)' : '*', { count: 'exact' })).order(sort).order('id').range(0, PAGE - 1)
  if (term) q = q.ilike(cfg.search, `%${term}%`)
  const refs = Object.entries(cfg.refs || {})
  const [{ data: rows, count }, other, { data: people }, ...refRows] = await Promise.all([
    q,
    isStores && kind(db().from(master).select('id', { count: 'exact', head: true }), !lines), // the other tab's count
    isCust ? db().from('profiles').select('id, full_name').in('role', ['sales', 'admin']).eq('active', true).order('full_name') : { data: [] },
    ...refs.map(([, table]) => db().from(table).select('code').order('code')),
  ])
  const lists = Object.fromEntries(refs.map(([col], i) => [col, (refRows[i].data || []).map((r) => r.code)]))
  const link = (p, s = sort) => `/admin/${master}?${new URLSearchParams({ ...(lines && { kind: 'lines' }), ...(p && { page: p }), ...(term && { q: term }), ...(s !== 'id' && { sort: s }) })}`
  const sorts = Object.fromEntries(['code', 'name'].map((c) => [c, { href: link(0, c), dir: sort === c ? 'ascending' : 'none' }]))
  const here = link(page)
  const form = { cols: cfg.cols, listCols: cfg.listCols, required: cfg.required, numbers: cfg.numbers, options: cfg.options, defaults: lines ? { ...cfg.defaults, type: 'WIP' } : cfg.defaults, labels: cfg.labels }
  // Only what the table and its dialogs show goes to the browser.
  const pick = (r) => ({
    ...Object.fromEntries(['id', ...cfg.cols, ...(isCust ? ['salesperson_id'] : [])].map((c) => [c, r[c] ?? null])),
    ...(isCust && { sp_name: r.sp?.full_name || null }),
  })
  const fields = (r) => <MasterFields cfg={form} row={r && pick(r)} people={isCust ? people : null} lists={lists} />

  return (
    <div className="card">
      {refs.some(([col]) => !lists[col].length) && (
        <div className="banner warn" style={{ margin: '16px 20px 0' }}>
          <i className="ph ph-warning" /><span>Add a plant under <Link prefetch={false} href="/admin/plants">Plants</Link> first: every store belongs to one.</span>
        </div>
      )}
      <div className="tbl-top">
        {isStores ? (
          <nav className="tabs mb-0" aria-label="Stores or production lines">
            {[[false, 'Stores', 'ph-warehouse'], [true, 'Production lines', 'ph-gear-six']].map(([l, label, icon]) => (
              <Link prefetch={false} key={label} href={`/admin/stores${l ? '?kind=lines' : ''}`} className={`tab${l === lines ? ' on' : ''}`} aria-current={l === lines ? 'page' : undefined}>
                <LinkBusy /><i className={`ph ${icon}`} />{label}<span className="badge b-none">{(l === lines ? count : other?.count) ?? 0}</span>
              </Link>
            ))}
          </nav>
        ) : (
          <h2 className="tbl-ttl">
            <i className={`ph ${cfg.icon}`} />{cfg.title}
            <span className="badge b-none">{count ?? 0}</span>
          </h2>
        )}
        <div className="tbl-filters">
          <form className="sw">
            <i className="ph ph-magnifying-glass" />
            <input className="tsearch" name="q" defaultValue={term} placeholder={`Search ${cfg.search}…`} aria-label={`Search ${cfg.title}`} />
          </form>
          <Modal title={`Add ${one}`} icon="ph-plus" label={`Add ${one}`} btnIcon="ph-plus">
            <form action={saveMaster}>
              <input type="hidden" name="table" value={master} />
              <input type="hidden" name="back" value={here} />
              <div className="modal-body">{fields(null)}</div>
              <ModalFoot label={`Add ${one}`} icon="ph-plus" />
            </form>
          </Modal>
          <Modal title={`Bulk Upload / Update ${cfg.title}`} icon="ph-upload-simple" label="Bulk Upload / Update" btnIcon="ph-upload-simple" btnClass="btn btn-ghost btn-sm">
            <form action={importMaster}>
              <input type="hidden" name="table" value={master} />
              <div className="modal-body">
                <p>
                  <b>Upload new records or update existing {cfg.title.toLowerCase()} in bulk.</b>
                </p>
                <p>
                  Records are matched by <b>code</b>: if the code already exists, its details are updated in place. If it is new, a new {one.toLowerCase()} is added.
                  {isCust && ' Salesperson can be specified by user name, email, or username.'}
                </p>
                <div style={{ display: 'flex', gap: '8px', margin: '12px 0 16px', flexWrap: 'wrap' }}>
                  <a className="btn btn-ghost btn-sm" href={`/admin/export/${master}-template`}>
                    <i className="ph ph-file-arrow-down" />Download Blank Template (CSV)
                  </a>
                  <a className="btn btn-ghost btn-sm" href={`/admin/export/${master}`}>
                    <i className="ph ph-download-simple" />Export Current {cfg.title} (CSV)
                  </a>
                </div>
                <div style={{ marginBottom: '12px' }}>
                  <span className="muted text-sm">Columns: {[...cfg.cols, ...(isCust ? ['salesperson'] : [])].join(', ')}</span>
                </div>
                <FileDrop name="file" accept=".csv,text/csv" hint="CSV UTF-8, max 4 MB" maxMB={4} />
              </div>
              <ModalFoot label="Upload & Update" icon="ph-upload-simple" />
            </form>
          </Modal>
          <a className="btn btn-ghost btn-sm" href={`/admin/export/${master}`} title={`Download all ${cfg.title.toLowerCase()} as CSV`}><i className="ph ph-download-simple" />Export CSV</a>
        </div>
      </div>
      <div className="tbl-wrap">
        <MasterTable
          cfg={form}
          rows={(rows || []).map(pick)}
          totalCount={count ?? 0}
          people={isCust ? people : null}
          lists={lists}
          table={master}
          title={cfg.title}
          search={cfg.search}
          term={term}
          sort={sort}
          kind={lines ? 'lines' : null}
          here={here}
          sorts={sorts}
        />
        {!rows?.length && (
          <div className="empty">
            <i className="ph ph-magnifying-glass" />
            <h3>Nothing found</h3>
            <p>{term ? `No ${lines ? 'production lines' : cfg.title.toLowerCase()} match “${term}”.` : `No ${lines ? 'production lines' : cfg.title.toLowerCase()} yet.`}</p>
          </div>
        )}
      </div>
    </div>
  )
}
