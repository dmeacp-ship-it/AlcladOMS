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

  let q = kind(db().from(master).select(isCust ? '*, sp:profiles(full_name)' : '*', { count: 'exact' })).order(sort).order('id').range(page * PAGE, page * PAGE + PAGE - 1)
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
  const form = { cols: cfg.cols, required: cfg.required, numbers: cfg.numbers, options: cfg.options, defaults: lines ? { ...cfg.defaults, type: 'WIP' } : cfg.defaults, labels: cfg.labels }
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
          <nav className="tabs" aria-label="Stores or production lines" style={{ marginBottom: 0 }}>
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
          <Modal title={`Import ${cfg.title}`} icon="ph-upload-simple" label="Import" btnIcon="ph-upload-simple" btnClass="btn btn-ghost btn-sm">
            <form action={importMaster}>
              <input type="hidden" name="table" value={master} />
              <div className="modal-body">
                <p>
                  Save the Excel sheet as <b>CSV UTF-8</b> (File → Save As). The first row must be the column names, the same as in{' '}
                  <a href={`/admin/export/${master}`}>an Export</a>: <span className="muted">{[...cfg.cols, ...(isCust ? ['salesperson'] : [])].join(', ')}</span>.
                </p>
                <p>{cfg.title} are matched on code: new codes are added, existing ones are updated.{isCust && ' Salesperson can be a name, email or username.'}</p>
                <FileDrop name="file" accept=".csv,text/csv" hint="CSV, max 4 MB" maxMB={4} />
              </div>
              <ModalFoot label="Import" icon="ph-upload-simple" />
            </form>
          </Modal>
          <a className="btn btn-ghost btn-sm" href={`/admin/export/${master}`}><i className="ph ph-download-simple" />Export</a>
        </div>
      </div>
      <div className="tbl-wrap">
        <MasterTable cfg={form} rows={(rows || []).map(pick)} people={isCust ? people : null} lists={lists}
          table={master} title={cfg.title} search={cfg.search} here={here} sorts={sorts} />
        {!rows?.length && (
          <div className="empty">
            <i className="ph ph-magnifying-glass" />
            <h3>Nothing found</h3>
            <p>{term ? `No ${lines ? 'production lines' : cfg.title.toLowerCase()} match “${term}”.` : `No ${lines ? 'production lines' : cfg.title.toLowerCase()} yet.`}</p>
          </div>
        )}
      </div>
      {(count ?? 0) > PAGE && (
        <div className="tbl-foot center">
          {page > 0 ? <Link prefetch={false} className="btn btn-ghost btn-sm" href={link(page - 1)}><LinkBusy /><i className="ph ph-caret-left" />Previous</Link> : <span />}
          <span className="spacer muted text-sm c">
            {page * PAGE + 1}–{Math.min((page + 1) * PAGE, count)} of {count}
          </span>
          {(page + 1) * PAGE < count && <Link prefetch={false} className="btn btn-ghost btn-sm" href={link(page + 1)}><LinkBusy />Next<i className="ph ph-caret-right" /></Link>}
        </div>
      )}
    </div>
  )
}
