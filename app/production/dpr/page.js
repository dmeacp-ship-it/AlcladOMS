import Link from 'next/link'
import { db, requireRole } from '@/lib/server'
import { storeLabel } from '@/lib/inventory'
import { SHIFTS, prodMissing } from '@/lib/production'
import { day, money, qty } from '@/lib/tas'
import { ClickRow, LinkBusy } from '../../ui'
import ProdTabs from '../ProdTabs'

export const metadata = { title: 'Enter Production' }
const LIMIT = 200

export default async function Dprs({ searchParams }) {
  const term = String((await searchParams).q || '').replace(/[,()*%]/g, '').trim()
  let q = db().from('productions').select('*, line:stores(name, plant_code), plan:production_plans(plan_no), items:production_items(good_qty, rejected_qty, qc_at, f:fg_items(m2_per_pc))')
    .order('prod_date', { ascending: false }).order('id', { ascending: false }).limit(LIMIT)
  if (term) q = q.or(`dpr_no.ilike.%${term}%,operator.ilike.%${term}%`)
  const [, missing, { data: rows }] = await Promise.all([requireRole('manager'), prodMissing(), q])
  const sum = (p, k) => p.items.reduce((n, i) => n + Number(i[k]), 0)

  return (
    <>
      <ProdTabs tab="dpr" missing={missing} />
      <div className="card">
        <div className="tbl-top">
          <h2 className="tbl-ttl"><i className="ph ph-factory" />Production entries <span className="badge b-none">{rows?.length ?? 0}</span></h2>
          <div className="tbl-filters">
            <form className="sw"><i className="ph ph-magnifying-glass" /><input className="tsearch" name="q" defaultValue={term} placeholder="DPR no or operator…" aria-label="Search production entries" /></form>
            <Link prefetch={false} href="/production/dpr/new" className="btn btn-primary btn-sm"><LinkBusy /><i className="ph ph-plus" />Enter production</Link>
          </div>
        </div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>DPR No</th><th>Date</th><th>Shift</th><th>Line</th><th>Plan</th><th className="r">Good pcs</th><th className="r">Good M2</th><th className="r">Rejected</th><th>Checked</th></tr></thead>
            <tbody>
              {rows?.map((p) => {
                const open = p.items.filter((i) => !i.qc_at && i.good_qty > 0).length
                return (
                  <ClickRow key={p.id} href={`/production/dpr/${p.id}`}>
                    <td className="nowrap"><Link prefetch={false} className="qno" href={`/production/dpr/${p.id}`}>{p.dpr_no}</Link></td>
                    <td className="nowrap" data-label="Date">{day(p.prod_date)}</td>
                    <td data-label="Shift">{SHIFTS[p.shift]}</td>
                    <td data-label="Line">{storeLabel(p.line)}</td>
                    <td data-label="Plan">{p.plan?.plan_no || <span className="muted">—</span>}</td>
                    <td className="num fw6" data-label="Good pcs">{qty(sum(p, 'good_qty'))}</td>
                    <td className="num" data-label="Good M2">{money(p.items.reduce((n, i) => n + i.good_qty * i.f.m2_per_pc, 0))}</td>
                    <td className="num" data-label="Rejected">{sum(p, 'rejected_qty') ? qty(sum(p, 'rejected_qty')) : <span className="muted">0</span>}</td>
                    <td className="nowrap" data-label="Checked">{open ? <span className="badge b-warn">{open} waiting</span> : <span className="badge b-ok">Done</span>}</td>
                  </ClickRow>
                )
              })}
            </tbody>
          </table>
          {!rows?.length && <div className="empty"><i className="ph ph-factory" /><h3>No production yet</h3><p>Enter production from a plan, or with Enter production.</p></div>}
        </div>
      </div>
    </>
  )
}
