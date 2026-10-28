import Link from 'next/link'
import { requireRole } from '@/lib/server'
import { invMasters, isLow, stockReport, storeLabel } from '@/lib/inventory'
import { day, qty } from '@/lib/tas'
import InvTabs from './InvTabs'

export const metadata = { title: 'Stock' }

// Stock per store and material for a period: opening, in, out, closing. Red = below the material's min level.
export default async function Stock({ searchParams }) {
  const sp = await searchParams
  const [, { missing, plants, stores }, { rows, p, error }] = await Promise.all([requireRole('manager'), invMasters(), stockReport(sp)])
  const low = rows.filter(isLow).length

  return (
    <>
      <InvTabs tab="" missing={missing} />
      <form className="page-head" action="/inventory">
        <div className="row">
          <label htmlFor="from" className="sub">From</label>
          <input id="from" type="date" name="from" defaultValue={p.from} style={{ width: 160 }} />
          <label htmlFor="to" className="sub">to</label>
          <input id="to" type="date" name="to" defaultValue={p.to} style={{ width: 160 }} />
          <select name="plant" defaultValue={p.plant} aria-label="Plant" className="flt-sel">
            <option value="">All plants</option>
            {plants.map((x) => <option key={x.code} value={x.code}>{x.name}</option>)}
          </select>
          <select name="store" defaultValue={p.store} aria-label="Store" className="flt-sel">
            <option value="">All stores</option>
            {stores.map((s) => <option key={s.id} value={s.id}>{storeLabel(s)}</option>)}
          </select>
          <input name="q" defaultValue={p.q} placeholder="Material code or name…" aria-label="Search materials" style={{ width: 200 }} />
          <label className="row text-sm" style={{ gap: 6 }}><input type="checkbox" name="low" value="1" defaultChecked={p.low} />Below min only</label>
          <button className="btn btn-ghost btn-sm"><i className="ph ph-check" />Apply</button>
        </div>
        <div className="acts">
          <Link prefetch={false} className="btn btn-ghost btn-sm" href="/inventory/adjust"><i className="ph ph-sliders-horizontal" />Stock correction</Link>
          <a className="btn btn-ghost btn-sm" href={`/inventory/export?${p.qs}`}><i className="ph ph-download-simple" />Download CSV</a>
        </div>
      </form>

      {error && !missing && <div className="banner error"><i className="ph ph-warning-circle" />Couldn't load the stock. Press Refresh to try again; if it keeps failing, tell the admin.</div>}

      <div className="card">
        <div className="tbl-top">
          <h2 className="tbl-ttl">
            <i className="ph ph-warehouse" />Stock {day(p.from)} – {day(p.to)} <span className="badge b-none">{rows.length}</span>
            {low > 0 && <span className="badge b-bad">{low} below min</span>}
          </h2>
        </div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Store</th><th>Material</th><th>UoM</th><th className="r">Opening</th><th className="r">In</th><th className="r">Out</th><th className="r">Closing</th><th className="r">Min level</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.store_id}-${r.material_id}`}>
                  <td className="nowrap">{r.store} <span className="muted">{r.plant_code}</span></td>
                  <td data-label="Material"><span className="mat-name">{r.name}</span><span className="mat-sub">{r.code} · {r.category}</span></td>
                  <td data-label="UoM">{r.uom}</td>
                  <td className="num" data-label="Opening">{qty(r.opening)}</td>
                  <td className="num" data-label="In">{Number(r.inward) ? qty(r.inward) : <span className="muted">0</span>}</td>
                  <td className="num" data-label="Out">{Number(r.outward) ? qty(r.outward) : <span className="muted">0</span>}</td>
                  <td className={`num fw6${isLow(r) ? ' red' : ''}`} data-label="Closing">{qty(r.closing)}</td>
                  <td className="num muted" data-label="Min level">{r.min_level != null && !r.wip ? qty(r.min_level) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <div className="empty"><i className="ph ph-warehouse" /><h3>No stock here</h3><p>{p.q || p.low ? 'Nothing matches these filters.' : 'Stock appears once the opening stock is loaded or goods pass QC.'}</p></div>}
        </div>
      </div>
    </>
  )
}
