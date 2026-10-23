import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db, requireRole } from '@/lib/server'
import { MASTERS } from '@/lib/tas'
import { deleteMaster, saveMaster } from '../actions'
import { Modal, ModalFoot } from '../../ui'

const PAGE = 50
const label = (c) => c.replace(/_/g, ' ').replace(/\b\w/g, (x) => x.toUpperCase()).replace(/\b(Cr|Vat|Uom)\b/g, (x) => x.toUpperCase())
const WIDE = ['address', 'description']

// Customers and Items: search, paging, add / edit / delete in dialogs.
export default async function Master({ params, searchParams }) {
  await requireRole('admin')
  const { master } = await params
  const cfg = MASTERS[master]
  if (!cfg) notFound()
  const sp = await searchParams
  const page = Math.max(0, parseInt(sp.page) || 0)
  const term = String(sp.q || '').trim()
  const one = cfg.title.slice(0, -1)

  let q = db().from(master).select('*', { count: 'exact' }).order('id').range(page * PAGE, page * PAGE + PAGE - 1)
  if (term) q = q.ilike(cfg.search, `%${term}%`)
  const { data: rows, count } = await q
  const link = (p) => `/admin/${master}?${new URLSearchParams({ ...(p && { page: p }), ...(term && { q: term }) })}`
  const here = link(page)

  const fields = (r) => (
    <div className="fgrid-2">
      {cfg.cols.map((c) => (
        <div className={`fg${WIDE.includes(c) ? ' full' : ''}`} key={c}>
          <label htmlFor={`${c}-${r?.id ?? 'new'}`}>{label(c)} {cfg.required.includes(c) && <span className="req">*</span>}</label>
          <input id={`${c}-${r?.id ?? 'new'}`} name={c} defaultValue={r?.[c] ?? ''} required={cfg.required.includes(c)} />
        </div>
      ))}
    </div>
  )

  return (
    <div className="card">
      <div className="tbl-top">
        <div className="tbl-ttl">
          <i className={`ph ${master === 'items' ? 'ph-cube' : 'ph-buildings'}`} />{cfg.title}
          <span className="badge b-none">{count ?? 0}</span>
        </div>
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
        </div>
      </div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>{cfg.cols.map((c) => <th key={c}>{label(c)}</th>)}<th className="r">Actions</th></tr>
          </thead>
          <tbody>
            {rows?.map((r) => (
              <tr key={r.id}>
                {cfg.cols.map((c) => (
                  <td key={c} className={c === 'name' || c === 'description' ? 'desc' : c === 'address' ? 'text-sm' : 'nowrap'}
                    style={c === 'address' ? { minWidth: 220 } : c === 'description' ? { minWidth: 260 } : undefined}>
                    {r[c] ?? <span className="muted">—</span>}
                  </td>
                ))}
                <td>
                  <div className="row-acts">
                    <Modal title={`Edit ${one}`} icon="ph-pencil-simple" btnIcon="ph-pencil-simple" ariaLabel={`Edit ${r[cfg.search] || one}`}
                      btnClass="btn btn-ghost btn-sm act-icon-btn">
                      <form action={saveMaster}>
                        <input type="hidden" name="table" value={master} />
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="back" value={here} />
                        <div className="modal-body">{fields(r)}</div>
                        <ModalFoot label="Save changes" icon="ph-check" />
                      </form>
                    </Modal>
                    <Modal title={`Delete ${one}?`} icon="ph-warning-circle" btnIcon="ph-trash" ariaLabel={`Delete ${r[cfg.search] || one}`}
                      btnClass="btn btn-ghost danger btn-sm act-icon-btn" size="small">
                      <form action={deleteMaster}>
                        <input type="hidden" name="table" value={master} />
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="back" value={here} />
                        <div className="modal-body">
                          <p><b>{r[cfg.search] || `#${r.id}`}</b> will be removed from the {cfg.title.toLowerCase()} master.</p>
                          <p>Existing quotations keep their own copy of the details.</p>
                        </div>
                        <ModalFoot label="Delete" icon="ph-trash" cls="btn-danger" />
                      </form>
                    </Modal>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
          {page > 0 ? <Link className="btn btn-ghost btn-sm" href={link(page - 1)}><i className="ph ph-caret-left" />Previous</Link> : <span />}
          <span className="spacer muted text-sm c">
            {page * PAGE + 1}–{Math.min((page + 1) * PAGE, count)} of {count}
          </span>
          {(page + 1) * PAGE < count && <Link className="btn btn-ghost btn-sm" href={link(page + 1)}>Next<i className="ph ph-caret-right" /></Link>}
        </div>
      )}
    </div>
  )
}
