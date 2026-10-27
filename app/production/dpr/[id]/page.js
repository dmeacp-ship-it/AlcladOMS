import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db, requireRole } from '@/lib/server'
import { storeLabel } from '@/lib/inventory'
import { SHIFTS } from '@/lib/production'
import { getSettings } from '@/lib/settings'
import { dmy, money, qty } from '@/lib/tas'
import { PrintButton } from '../../../ui'
import Slip from '../../../inventory/Slip'

export async function generateMetadata({ params }) {
  const { data } = await db().from('productions').select('dpr_no').eq('id', (await params).id).maybeSingle()
  return { title: { absolute: data?.dpr_no || 'Production' } }
}

// One production entry (DPR): pieces per item with their QC result, and the RM used off the line.
export default async function Dpr({ params }) {
  const { id } = await params
  if (!/^\d+$/.test(id)) notFound()
  const [, { data: p }, s] = await Promise.all([
    requireRole('manager'),
    db().from('productions').select('*, line:stores(name, plant_code), plan:production_plans(id, plan_no), items:production_items(*, f:fg_items(code, color_name, m2_per_pc))').eq('id', id).maybeSingle(),
    getSettings(),
  ])
  if (!p) notFound()
  p.items.sort((a, b) => a.id - b.id)
  const { data: used } = await db().from('stock_moves').select('qty, m:materials(code, name, uom)').eq('ref_type', 'USE').eq('ref_no', p.dpr_no)
  const qc = (i) => (i.qc_at ? `${qty(i.qc_pass)} / ${qty(i.qc_b)} / ${qty(i.qc_reject)}` : i.good_qty > 0 ? 'QC pending' : '—')

  return (
    <>
      <div className="page-head no-print">
        <Link prefetch={false} href="/production/dpr" className="btn btn-ghost btn-sm"><i className="ph ph-arrow-left" />Enter Production</Link>
        {p.plan && <Link prefetch={false} href={`/production/plan/${p.plan.id}`} className="chip-link">{p.plan.plan_no}</Link>}
        {p.items.some((i) => !i.qc_at && i.good_qty > 0) && <Link prefetch={false} href="/production/qc" className="btn btn-primary btn-sm"><i className="ph ph-seal-check" />Check these pieces</Link>}
        <div className="acts"><PrintButton /></div>
      </div>
      <Slip
        s={s} fno="F.NO:-TAS/PRD/02" title="DAILY PRODUCTION REPORT"
        meta={[['DATE', dmy(p.prod_date)], ['DPR NO.', p.dpr_no], ['SHIFT', SHIFTS[p.shift]], ['LINE', storeLabel(p.line)]]}
        party={[['OPERATOR', [p.operator, `Entered by ${p.by_name}`]], ['RM USED', (used || []).map((u) => `${u.m.name} (${u.m.code}): ${qty(-u.qty)} ${u.m.uom}`)]]}
        heads={['ITEM (PRODUCT + SIZE)', 'GOOD PCS', 'GOOD M2', 'REJECTED', 'QC PASS / B / REJ']}
        rows={p.items.map((i) => [`${i.f.code}${i.reject_reason ? ` (rejected: ${i.reject_reason})` : ''}`, qty(i.good_qty), money(i.good_qty * i.f.m2_per_pc), qty(i.rejected_qty), qc(i)])}
        foot={['TOTAL', qty(p.items.reduce((n, i) => n + Number(i.good_qty), 0)), money(p.items.reduce((n, i) => n + i.good_qty * i.f.m2_per_pc, 0)), qty(p.items.reduce((n, i) => n + Number(i.rejected_qty), 0)), '']}
        notes={p.notes}
        signs={['Shift Incharge', 'Production Manager']}
      />
    </>
  )
}
