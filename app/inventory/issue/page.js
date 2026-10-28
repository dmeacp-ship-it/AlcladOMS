import Link from 'next/link'
import { db, requireRole } from '@/lib/server'
import { invMasters, storeLabel } from '@/lib/inventory'
import { getSettings } from '@/lib/settings'
import { day } from '@/lib/tas'
import { ClickRow, LinkBusy } from '../../ui'
import InvTabs from '../InvTabs'
import IssueDialog from './IssueDialog'

export async function generateMetadata({ searchParams }) {
  const sp = await searchParams
  if (/^\d+$/.test(sp.view || '')) {
    const { data } = await db().from('transfers').select('doc_no').eq('id', sp.view).maybeSingle()
    if (data?.doc_no) return { title: { absolute: data.doc_no } }
  }
  return { title: 'Issue to Line' }
}

const LIMIT = 200

export default async function Issues({ searchParams }) {
  const sp = await searchParams
  const term = String(sp.q || '').replace(/[,()*%]/g, '').trim()
  const viewId = /^\d+$/.test(sp.view || '') ? sp.view : null

  let q = db().from('transfers').select('*, from:stores!from_store_id(name, plant_code), to:stores!to_store_id(name, plant_code), items:transfer_items(id)')
    .order('id', { ascending: false }).limit(LIMIT)
  if (term) q = q.or(`doc_no.ilike.%${term}%,requested_by.ilike.%${term}%`)

  const issueQuery = viewId
    ? db().from('transfers')
        .select('*, from:stores!from_store_id(name, plant_code), to:stores!to_store_id(name, plant_code), items:transfer_items(*, m:materials(code, name, uom))')
        .eq('id', viewId).maybeSingle()
    : Promise.resolve({ data: null })
  const settingsQuery = viewId ? getSettings() : Promise.resolve(null)

  const [, { missing }, { data: rows }, { data: viewIssue }, s] = await Promise.all([
    requireRole('manager'),
    invMasters(),
    q,
    issueQuery,
    settingsQuery,
  ])

  const list = { ...(term && { q: term }) }
  const viewHref = (id) => `/inventory/issue?${new URLSearchParams({ ...list, view: id })}`
  const listHref = `/inventory/issue${Object.keys(list).length ? `?${new URLSearchParams(list)}` : ''}`

  return (
    <>
      <InvTabs tab="issue" missing={missing} />
      <div className="card">
        <div className="tbl-top">
          <h2 className="tbl-ttl"><i className="ph ph-arrows-left-right" />Issues &amp; transfers <span className="badge b-none">{rows?.length ?? 0}</span></h2>
          <div className="tbl-filters">
            <form className="sw">
              <i className="ph ph-magnifying-glass" />
              <input className="tsearch" name="q" defaultValue={term} placeholder="Issue no or requested by…" aria-label="Search issues" />
            </form>
            <Link prefetch={false} href="/inventory/issue/new" className="btn btn-primary btn-sm"><LinkBusy /><i className="ph ph-plus" />New issue</Link>
          </div>
        </div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Issue No</th><th>Date</th><th>From</th><th>To</th><th>Requested by</th><th className="r">Lines</th><th>Entered by</th></tr></thead>
            <tbody>
              {rows?.map((t) => (
                <ClickRow key={t.id} href={viewHref(t.id)}>
                  <td className="nowrap"><Link prefetch={false} className="qno" href={viewHref(t.id)}>{t.doc_no}</Link></td>
                  <td className="nowrap" data-label="Date">{day(t.doc_date)}</td>
                  <td data-label="From">{storeLabel(t.from)}</td>
                  <td className="fw6" data-label="To">{storeLabel(t.to)}</td>
                  <td data-label="Requested by">{t.requested_by || <span className="muted">—</span>}</td>
                  <td className="num" data-label="Lines">{t.items.length}</td>
                  <td data-label="Entered by">{t.by_name}</td>
                </ClickRow>
              ))}
            </tbody>
          </table>
          {!rows?.length && <div className="empty"><i className="ph ph-arrows-left-right" /><h3>No issues yet</h3><p>Issue material from a store to a production line (a WIP store) with New issue.</p></div>}
        </div>
      </div>

      {viewIssue && (
        <IssueDialog
          issue={viewIssue}
          s={s}
          closeHref={listHref}
        />
      )}
    </>
  )
}
