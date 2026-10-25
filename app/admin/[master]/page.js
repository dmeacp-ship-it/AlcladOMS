import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db, requireRole } from '@/lib/server'
import { MASTERS } from '@/lib/tas'
import { importMaster, saveMaster } from '../actions'
import { FileDrop, Modal, ModalFoot } from '../../ui'
import MasterFields, { MasterTable } from './MasterFields'

const PAGE = 50

export async function generateMetadata({ params }) {
  return { title: MASTERS[(await params).master]?.title }
}

// Customers and Items: search, paging, add / edit / delete in dialogs.
export default async function Master({ params, searchParams }) {
  await requireRole('admin')
  const { master } = await params
  const cfg = MASTERS[master]
  if (!cfg) notFound()
  const sp = await searchParams
  const page = Math.max(0, parseInt(sp.page) || 0)
  const term = String(sp.q || '').trim()
  const sort = ['name', 'code'].includes(sp.sort) ? sp.sort : 'id'
  const one = cfg.title.slice(0, -1)

  const isCust = master === 'customers'
  let q = db().from(master).select(isCust ? '*, sp:profiles(full_name)' : '*', { count: 'exact' }).order(sort).order('id').range(page * PAGE, page * PAGE + PAGE - 1)
  if (term) q = q.ilike(cfg.search, `%${term}%`)
  const [{ data: rows, count }, { data: people }] = await Promise.all([
    q,
    isCust ? db().from('profiles').select('id, full_name').in('role', ['sales', 'admin']).eq('active', true).order('full_name') : { data: [] },
  ])
  const link = (p, s = sort) => `/admin/${master}?${new URLSearchParams({ ...(p && { page: p }), ...(term && { q: term }), ...(s !== 'id' && { sort: s }) })}`
  const sorts = isCust ? Object.fromEntries(['code', 'name'].map((c) => [c, { href: link(0, c), dir: sort === c ? 'ascending' : 'none' }])) : {}
  const here = link(page)
  const form = { cols: cfg.cols, required: cfg.required, numbers: cfg.numbers }
  // Only what the table and its dialogs show goes to the browser.
  const pick = (r) => ({
    ...Object.fromEntries(['id', ...cfg.cols, ...(isCust ? ['salesperson_id'] : [])].map((c) => [c, r[c] ?? null])),
    ...(isCust && { sp_name: r.sp?.full_name || null }),
  })
  const fields = (r) => <MasterFields cfg={form} row={r && pick(r)} people={isCust ? people : null} />

  return (
    <div className="card">
      <div className="tbl-top">
        <h2 className="tbl-ttl">
          <i className={`ph ${master === 'items' ? 'ph-cube' : 'ph-buildings'}`} />{cfg.title}
          <span className="badge b-none">{count ?? 0}</span>
        </h2>
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
                <p>{isCust
                  ? 'Customers are matched on code: new codes are added, existing ones are updated. Salesperson can be a name, email or username.'
                  : 'Rows are added; an item whose description is already in the master is skipped.'}</p>
                <FileDrop name="file" accept=".csv,text/csv" hint="CSV, max 4 MB" maxMB={4} />
              </div>
              <ModalFoot label="Import" icon="ph-upload-simple" />
            </form>
          </Modal>
          <a className="btn btn-ghost btn-sm" href={`/admin/export/${master}`}><i className="ph ph-download-simple" />Export</a>
        </div>
      </div>
      <div className="tbl-wrap">
        <MasterTable cfg={form} rows={(rows || []).map(pick)} people={isCust ? people : null}
          table={master} title={cfg.title} search={cfg.search} here={here} sorts={sorts} />
        {!rows?.length && (
          <div className="empty">
            <i className="ph ph-magnifying-glass" />
            <h3>Nothing found</h3>
            <p>{term ? `No ${cfg.title.toLowerCase()} match “${term}”.` : `No ${cfg.title.toLowerCase()} yet.`}</p>
          </div>
        )}
      </div>
      {(count ?? 0) > PAGE && (
        <div className="tbl-foot center">
          {page > 0 ? <Link prefetch={false} className="btn btn-ghost btn-sm" href={link(page - 1)}><i className="ph ph-caret-left" />Previous</Link> : <span />}
          <span className="spacer muted text-sm c">
            {page * PAGE + 1}–{Math.min((page + 1) * PAGE, count)} of {count}
          </span>
          {(page + 1) * PAGE < count && <Link prefetch={false} className="btn btn-ghost btn-sm" href={link(page + 1)}>Next<i className="ph ph-caret-right" /></Link>}
        </div>
      )}
    </div>
  )
}
