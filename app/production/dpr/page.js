import Link from 'next/link'
import { db, requireRole } from '@/lib/server'
import { storeLabel } from '@/lib/inventory'
import { getSettings } from '@/lib/settings'
import { SHIFTS, prodMissing } from '@/lib/production'
import { day, money, qty } from '@/lib/tas'
import { ClickRow, LinkBusy } from '../../ui'
import ProdTabs from '../ProdTabs'
import DprDialog from './DprDialog'

export async function generateMetadata({ searchParams }) {
  const sp = await searchParams
  if (/^\d+$/.test(sp.view || '')) {
    const { data } = await db().from('productions').select('dpr_no').eq('id', sp.view).maybeSingle()
    if (data?.dpr_no) return { title: { absolute: data.dpr_no } }
  }
  return { title: 'Enter Production' }
}

const LIMIT = 200

export default async function Dprs({ searchParams }) {
  const sp = await searchParams
  const term = String(sp.q || '').replace(/[,()*%]/g, '').trim()
  const viewId = /^\d+$/.test(sp.view || '') ? sp.view : null

  let q = db().from('productions').select('*, line:stores(name, plant_code), plan:production_plans(plan_no), items:production_items(good_qty, rejected_qty, qc_at, f:fg_items(m2_per_pc))')
    .order('prod_date', { ascending: false }).order('id', { ascending: false }).limit(LIMIT)
  if (term) q = q.or(`dpr_no.ilike.%${term}%,operator.ilike.%${term}%`)

  const dprQuery = viewId
    ? db().from('productions')
        .select('*, line:stores(name, plant_code), plan:production_plans(id, plan_no), items:production_items(*, f:fg_items(code, color_name, m2_per_pc))')
        .eq('id', viewId).maybeSingle()
    : Promise.resolve({ data: null })
  const usedQuery = viewId
    ? db().from('stock_moves').select('qty, m:materials(code, name, uom)').eq('ref_type', 'USE')
    : Promise.resolve({ data: null })
  const settingsQuery = viewId ? getSettings() : Promise.resolve(null)

  const [, missing, { data: rows }, { data: viewDpr }, s] = await Promise.all([
    requireRole('manager'),
    prodMissing(),
    q,
    dprQuery,
    settingsQuery,
  ])

  let used = null
  if (viewDpr?.dpr_no) {
    const { data } = await db().from('stock_moves').select('qty, m:materials(code, name, uom)').eq('ref_type', 'USE').eq('ref_no', viewDpr.dpr_no)
    used = data
  }

  const sum = (p, k) => p.items.reduce((n, i) => n + Number(i[k]), 0)
  const list = { ...(term && { q: term }) }
  const viewHref = (id) => `/production/dpr?${new URLSearchParams({ ...list, view: id })}`
  const listHref = `/production/dpr${Object.keys(list).length ? `?${new URLSearchParams(list)}` : ''}`

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
                  <ClickRow key={p.id} href={viewHref(p.id)}>
                    <td className="nowrap"><Link prefetch={false} className="qno" href={viewHref(p.id)}>{p.dpr_no}</Link></td>
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

      {viewDpr && (
        <DprDialog
          dpr={viewDpr}
          used={used}
          s={s}
          closeHref={listHref}
        />
      )}
    </>
  )
}
