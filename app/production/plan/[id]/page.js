import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db, requireRole } from '@/lib/server'
import { storeLabel } from '@/lib/inventory'
import { SHIFTS } from '@/lib/production'
import { getSettings } from '@/lib/settings'
import { dmy, money, qty, today } from '@/lib/tas'
import { PrintButton } from '../../../ui'
import Slip from '../../../inventory/Slip'

export async function generateMetadata({ params }) {
  const { data } = await db().from('production_plans').select('plan_no').eq('id', (await params).id).maybeSingle()
  return { title: { absolute: data?.plan_no || 'Production Plan' } }
}

// One plan: printable sheet for the line, what is produced so far, and the RM on the line and in the plant's
// RM stores (until a BOM exists the planner judges what to issue; the production entry records what was used).
export default async function Plan({ params }) {
  const { id } = await params
  if (!/^\d+$/.test(id)) notFound()
  const [, { data: p }, s] = await Promise.all([
    requireRole('manager'),
    db().from('production_plans').select('*, line:stores(id, name, plant_code), items:plan_items(*, f:fg_items(code, color_name, m2_per_pc)), issues:transfers(id, doc_no, doc_date), dprs:productions(id, dpr_no, prod_date)')
      .eq('id', id).maybeSingle(),
    getSettings(),
  ])
  if (!p) notFound()
  p.items.sort((a, b) => a.id - b.id)
  const { data: rm } = await db().rpc('stock_summary', { p_from: today(), p_to: today(), p_plant: p.line.plant_code, p_store: null })
  const { data: rmStores } = await db().from('stores').select('id').eq('plant_code', p.line.plant_code).in('type', ['RM', 'WIP'])
  const keep = new Set((rmStores || []).map((x) => x.id))
  const stock = (rm || []).filter((r) => keep.has(r.store_id) && Number(r.closing) !== 0)
  const m2 = p.items.reduce((n, i) => n + i.qty * i.f.m2_per_pc, 0)

  return (
    <>
      <div className="page-head no-print">
        <Link prefetch={false} href="/production" className="btn btn-ghost btn-sm"><i className="ph ph-arrow-left" />Plan Production</Link>
        <span className={`badge ${p.status === 'DONE' ? 'b-ok' : 'b-info'}`}>{p.status === 'DONE' ? 'Done' : 'Open'}</span>
        <div className="acts">
          {p.status === 'OPEN' && (
            <>
              <Link prefetch={false} href={`/inventory/issue/new?plan=${p.id}`} className="btn btn-ghost btn-sm"><i className="ph ph-arrows-left-right" />Issue RM to this line</Link>
              <Link prefetch={false} href={`/production/dpr/new?plan=${p.id}`} className="btn btn-primary btn-sm"><i className="ph ph-factory" />Enter production</Link>
            </>
          )}
          <PrintButton />
        </div>
      </div>

      <Slip
        s={s} fno="F.NO:-TAS/PRD/01" title="PRODUCTION PLAN"
        meta={[['DATE', dmy(p.plan_date)], ['PLAN NO.', p.plan_no], ['SHIFT', SHIFTS[p.shift]], ['LINE', storeLabel(p.line)]]}
        heads={['ITEM (PRODUCT + SIZE)', 'COLOUR', 'PLANNED PCS', 'M2', 'PRODUCED PCS']}
        rows={p.items.map((i) => [i.f.code, i.f.color_name || '', qty(i.qty), money(i.qty * i.f.m2_per_pc), qty(i.produced_qty)])}
        foot={['TOTAL', '', qty(p.items.reduce((n, i) => n + Number(i.qty), 0)), money(m2), qty(p.items.reduce((n, i) => n + Number(i.produced_qty), 0))]}
        notes={p.notes}
        signs={['Planned By', 'Line Incharge']}
      />

      <div className="card no-print" style={{ marginTop: 20 }}>
        <div className="tbl-top">
          <h2 className="tbl-ttl"><i className="ph ph-warehouse" />RM in plant {p.line.plant_code} today</h2>
          <span className="muted text-sm">{money(m2)} M2 planned. RM per M2 will be calculated here once a BOM is added; for now issue what the line needs.</span>
        </div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Store</th><th>Material</th><th className="r">In stock</th></tr></thead>
            <tbody>
              {stock.map((r) => (
                <tr key={`${r.store_id}-${r.material_id}`}>
                  <td data-label="Store">{r.store}{r.store_id === p.line.id && <span className="badge b-teal" style={{ marginLeft: 6 }}>this line</span>}</td>
                  <td data-label="Material"><span className="mat-name">{r.name}</span><span className="mat-sub">{r.code}</span></td>
                  <td className="num fw6" data-label="In stock">{qty(r.closing)} {r.uom}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!stock.length && <div className="empty"><i className="ph ph-warehouse" /><h3>No RM in this plant</h3><p>Receive goods (GRN) or load the RM opening stock first.</p></div>}
        </div>
        {(p.issues.length > 0 || p.dprs.length > 0) && (
          <div className="tbl-foot">
            <div className="row">
              {p.issues.map((t) => <Link prefetch={false} key={`i${t.id}`} href={`/inventory/issue/${t.id}`} className="chip-link">{t.doc_no} · RM issued</Link>)}
              {p.dprs.map((d) => <Link prefetch={false} key={`d${d.id}`} href={`/production/dpr/${d.id}`} className="chip-link">{d.dpr_no} · production</Link>)}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
