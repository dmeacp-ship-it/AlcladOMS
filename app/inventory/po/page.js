import Link from 'next/link'
import { db, requireRole } from '@/lib/server'
import { invMasters } from '@/lib/inventory'
import { PO_STATUS, day, money, qty } from '@/lib/tas'
import { ClickRow, LinkBusy } from '../../ui'
import InvTabs from '../InvTabs'

export const metadata = { title: 'Purchase Orders' }
const LIMIT = 200
const SHOWS = { open: ['PENDING', 'APPROVED'], PENDING: ['PENDING'], APPROVED: ['APPROVED'], CLOSED: ['CLOSED'], REJECTED: ['REJECTED'] }

export default async function POList({ searchParams }) {
  const sp = await searchParams
  const show = SHOWS[sp.show] ? sp.show : 'open'
  const term = String(sp.q || '').replace(/[,()*%]/g, '').trim()
  let q = db().from('purchase_orders').select('*, items:po_items(qty, rate, pending_qty)').in('status', SHOWS[show]).order('id', { ascending: false }).limit(LIMIT)
  if (term) q = q.or(`po_no.ilike.%${term}%,vendor_name.ilike.%${term}%`)
  const [, { missing }, { data: rows }] = await Promise.all([requireRole('manager'), invMasters(), q])
  const href = (s) => `/inventory/po?${new URLSearchParams({ ...(s !== 'open' && { show: s }), ...(term && { q: term }) })}`

  return (
    <>
      <InvTabs tab="po" missing={missing} />
      <div className="card">
        <div className="tbl-top">
          <h2 className="tbl-ttl"><i className="ph ph-shopping-cart" />Purchase Orders <span className="badge b-none">{rows?.length ?? 0}</span></h2>
          <div className="tbl-filters">
            <nav className="tabs" aria-label="PO status" style={{ marginBottom: 0 }}>
              {[['open', 'Open'], ['PENDING', 'Pending approval'], ['APPROVED', 'Approved'], ['CLOSED', 'Closed'], ['REJECTED', 'Rejected']].map(([k, l]) => (
                <Link prefetch={false} key={k} href={href(k)} className={`tab${k === show ? ' on' : ''}`}><LinkBusy />{l}</Link>
              ))}
            </nav>
            <form className="sw">
              {show !== 'open' && <input type="hidden" name="show" value={show} />}
              <i className="ph ph-magnifying-glass" />
              <input className="tsearch" name="q" defaultValue={term} placeholder="PO no or vendor…" aria-label="Search purchase orders" />
            </form>
            <Link prefetch={false} href="/inventory/po/new" className="btn btn-primary btn-sm"><LinkBusy /><i className="ph ph-plus" />New PO</Link>
          </div>
        </div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>PO No</th><th>Date</th><th>Plant</th><th>Vendor</th><th className="r">Lines</th><th className="r">Value (SAR)</th><th className="r">Pending qty</th><th>Status</th></tr></thead>
            <tbody>
              {rows?.map((p) => {
                const [label, cls] = PO_STATUS[p.status]
                return (
                  <ClickRow key={p.id} href={`/inventory/po/${p.id}`}>
                    <td className="nowrap"><Link prefetch={false} href={`/inventory/po/${p.id}`} className="qno">{p.po_no}</Link></td>
                    <td className="nowrap" data-label="Date">{day(p.po_date)}</td>
                    <td data-label="Plant">{p.plant_code}</td>
                    <td className="fw6" data-label="Vendor"><bdi>{p.vendor_name}</bdi></td>
                    <td className="num" data-label="Lines">{p.items.length}</td>
                    <td className="num" data-label="Value">{money(p.items.reduce((n, i) => n + i.qty * i.rate, 0))}</td>
                    <td className="num" data-label="Pending">{qty(p.items.reduce((n, i) => n + Math.max(0, i.pending_qty), 0))}</td>
                    <td className="nowrap" data-label="Status"><span className={`badge ${cls}`}>{label}</span></td>
                  </ClickRow>
                )
              })}
            </tbody>
          </table>
          {!rows?.length && <div className="empty"><i className="ph ph-shopping-cart" /><h3>No purchase orders here</h3><p>{term ? `Nothing matches “${term}”.` : 'Create one with New PO.'}</p></div>}
        </div>
        {rows?.length === LIMIT && <div className="tbl-foot center"><span className="muted text-sm">Showing the latest {LIMIT} — search to narrow it down.</span></div>}
      </div>
    </>
  )
}
