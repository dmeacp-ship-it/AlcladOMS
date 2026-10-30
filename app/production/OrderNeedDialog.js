import Link from 'next/link'
import { money, qty } from '@/lib/tas'
import { RouteDialog } from '../ui'

export default function OrderNeedDialog({ rows, toMake, showAll, quotes, filterHref, closeHref }) {
  return (
    <RouteDialog
      icon="ph-list-checks"
      title={
        <>
          What open orders still need{' '}
          <span className="badge b-none">{rows.length}</span>
          {toMake > 0 && <span className="badge b-bad">{qty(toMake)} pcs still to make</span>}
        </>
      }
      footer={
        <>
          <Link prefetch={false} href={closeHref} className="btn btn-ghost">
            Close
          </Link>
          {toMake > 0 && (
            <Link prefetch={false} href="/production?new=1" scroll={false} className="btn btn-primary">
              <i className="ph ph-calendar-plus" />New Plan
            </Link>
          )}
        </>
      }
      closeHref={closeHref}
    >
      <div className="d-flex jc-sb ai-c mb-14 f-wrap gap-10">
        <span className="muted text-sm">
          Still to make = what orders need − what is in stock − already planned − being checked.
        </span>
        <nav className="tabs mb-0" aria-label="Shortages filter">
          <Link prefetch={false} href={filterHref(false)} className={`tab${!showAll ? ' on' : ''}`}>Shortages</Link>
          <Link prefetch={false} href={filterHref(true)} className={`tab${showAll ? ' on' : ''}`}>All</Link>
        </nav>
      </div>

      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Item (product + size)</th>
              <th>Orders</th>
              <th className="r">Orders need</th>
              <th className="r">In stock</th>
              <th className="r">Already planned</th>
              <th className="r">Being checked</th>
              <th className="r">Still to make</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.fg_item_id}>
                <td data-label="Item">
                  <span className="mat-name">{r.f?.code}</span>
                  <span className="mat-sub">{[r.f?.color_name, `${money(r.f?.m2_per_pc)} M2 / pc`].filter(Boolean).join(' · ')}</span>
                </td>
                <td className="text-sm" data-label="Orders">{[...(quotes[r.fg_item_id] || [])].join(', ') || <span className="muted">—</span>}</td>
                <td className="num" data-label="Orders need">{qty(r.need)}</td>
                <td className="num" data-label="In stock">{qty(Math.max(0, r.free))}</td>
                <td className="num" data-label="Already planned">{r.planned ? qty(r.planned) : <span className="muted">0</span>}</td>
                <td className="num" data-label="Being checked">{r.in_qc ? qty(r.in_qc) : <span className="muted">0</span>}</td>
                <td className={`num fw6${r.short ? ' red' : ''}`} data-label="Still to make">
                  {qty(r.short)}
                  <span className="mat-sub">{money(r.short * (r.f?.m2_per_pc || 0))} M2</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <div className="empty">
            <i className="ph ph-check-circle" />
            <h3>Nothing to plan</h3>
            <p>Every open order is covered by stock, a plan or pieces being checked.</p>
          </div>
        )}
      </div>
    </RouteDialog>
  )
}
