import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db, requireRole } from '@/lib/server'
import { storeLabel } from '@/lib/inventory'
import { getSettings } from '@/lib/settings'
import { dmy, qty } from '@/lib/tas'
import { PrintButton } from '../../../ui'
import Slip from '../../Slip'

export async function generateMetadata({ params }) {
  const { data } = await db().from('transfers').select('doc_no').eq('id', (await params).id).maybeSingle()
  return { title: { absolute: data?.doc_no || 'Issue' } }
}

export default async function Issue({ params }) {
  const { id } = await params
  if (!/^\d+$/.test(id)) notFound()
  const [, { data: t }, s] = await Promise.all([
    requireRole('manager'),
    db().from('transfers').select('*, from:stores!from_store_id(name, plant_code), to:stores!to_store_id(name, plant_code), items:transfer_items(*, m:materials(code, name, uom))')
      .eq('id', id).maybeSingle(),
    getSettings(),
  ])
  if (!t) notFound()
  t.items.sort((a, b) => a.id - b.id)
  return (
    <>
      <div className="page-head no-print">
        <Link prefetch={false} href="/inventory/issue" className="btn btn-ghost btn-sm"><i className="ph ph-arrow-left" />Issue / Transfer</Link>
        <div className="acts"><PrintButton /></div>
      </div>
      <Slip
        s={s} fno="F.NO:-TAS/STR/02" title="MATERIAL ISSUE SLIP"
        meta={[['DATE', dmy(t.doc_date)], ['ISSUE NO.', t.doc_no], ['REQUESTED BY', t.requested_by], ['ISSUED BY', t.by_name]]}
        party={[['FROM', [storeLabel(t.from)]], ['TO', [storeLabel(t.to)]]]}
        heads={['MATERIAL', 'CODE', 'UOM', 'QTY']}
        rows={t.items.map((i) => [i.m.name, i.m.code, i.m.uom, qty(i.qty)])}
        notes={t.notes}
        signs={['Issued By', 'Received By']}
      />
    </>
  )
}
