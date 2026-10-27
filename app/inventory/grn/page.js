import Link from 'next/link'
import { db, requireRole } from '@/lib/server'
import { invMasters } from '@/lib/inventory'
import { day } from '@/lib/tas'
import { ClickRow, LinkBusy } from '../../ui'
import InvTabs from '../InvTabs'

export const metadata = { title: 'Receive Goods' }
const LIMIT = 200

export default async function GRNList({ searchParams }) {
  const sp = await searchParams
  const pending = sp.show !== 'all'
  const term = String(sp.q || '').replace(/[,()*%]/g, '').trim()
  let q = db().from('grns').select('*, po:purchase_orders!inner(po_no, vendor_name), store:stores(name, plant_code), items:grn_items(id)')
    .order('id', { ascending: false }).limit(LIMIT)
  if (pending) q = q.eq('status', 'QC_PENDING')
  if (term) q = q.or(`grn_no.ilike.%${term}%,invoice_no.ilike.%${term}%`)
  const [, { missing }, { data: rows }] = await Promise.all([requireRole('manager'), invMasters(), q])
  const href = (all) => `/inventory/grn?${new URLSearchParams({ ...(all && { show: 'all' }), ...(term && { q: term }) })}`

  return (
    <>
      <InvTabs tab="grn" missing={missing} />
      <div className="card">
        <div className="tbl-top">
          <h2 className="tbl-ttl"><i className="ph ph-seal-check" />Goods received <span className="badge b-none">{rows?.length ?? 0}</span></h2>
          <div className="tbl-filters">
            <nav className="tabs" aria-label="GRN status" style={{ marginBottom: 0 }}>
              <Link prefetch={false} href={href(false)} className={`tab${pending ? ' on' : ''}`}><LinkBusy />Waiting to be checked</Link>
              <Link prefetch={false} href={href(true)} className={`tab${pending ? '' : ' on'}`}><LinkBusy />All</Link>
            </nav>
            <form className="sw">
              {!pending && <input type="hidden" name="show" value="all" />}
              <i className="ph ph-magnifying-glass" />
              <input className="tsearch" name="q" defaultValue={term} placeholder="GRN or invoice no…" aria-label="Search GRNs" />
            </form>
            <Link prefetch={false} href="/inventory/grn/new" className="btn btn-primary btn-sm"><LinkBusy /><i className="ph ph-plus" />Receive goods</Link>
          </div>
        </div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>GRN No</th><th>Date</th><th>PO</th><th>Vendor</th><th>Store</th><th>Invoice</th><th className="r">Lines</th><th>Checked</th></tr></thead>
            <tbody>
              {rows?.map((g) => (
                <ClickRow key={g.id} href={`/inventory/grn/${g.id}`}>
                  <td className="nowrap"><Link prefetch={false} className="qno" href={`/inventory/grn/${g.id}`}>{g.grn_no}</Link></td>
                  <td className="nowrap" data-label="Date">{day(g.grn_date)}</td>
                  <td className="nowrap" data-label="PO">{g.po.po_no}</td>
                  <td className="fw6" data-label="Vendor"><bdi>{g.po.vendor_name}</bdi></td>
                  <td data-label="Store">{g.store?.name} <span className="muted">{g.store?.plant_code}</span></td>
                  <td data-label="Invoice">{g.invoice_no || <span className="muted">—</span>}</td>
                  <td className="num" data-label="Lines">{g.items.length}</td>
                  <td className="nowrap" data-label="QC">{g.status === 'DONE' ? <span className="badge b-ok">Done</span> : <span className="badge b-warn">Not yet</span>}</td>
                </ClickRow>
              ))}
            </tbody>
          </table>
          {!rows?.length && <div className="empty"><i className="ph ph-seal-check" /><h3>{pending ? 'Nothing waiting to be checked' : 'Nothing received yet'}</h3><p>Goods are received on an approved PO with Receive goods.</p></div>}
        </div>
      </div>
    </>
  )
}
