import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getOrder, requireRole } from '@/lib/server'
import Doc, { docReady } from './Doc'
import { PrintButton } from '../../../../ui'

export default async function PrintPage({ params, searchParams }) {
  const me = await requireRole()
  const { id, doc } = await params
  const sp = await searchParams
  const o = await getOrder(id, me)

  const batchId = sp?.batch
  const batch = batchId
    ? (o.batches || []).find((b) => String(b.id) === String(batchId) || String(b.batch_no) === String(batchId))
    : (o.batches || [])[(o.batches || []).length - 1]

  if (!docReady(doc, o, batch)) notFound()
  return (
    <>
      <div className="page-head no-print">
        <Link href={`/orders?view=${o.id}`} className="btn btn-ghost btn-sm"><i className="ph ph-arrow-left" />Back to {o.quote_no}</Link>
        <div className="acts">
          <span className="muted text-sm">Choose “Save as PDF” as the printer to get a PDF file.</span>
          <PrintButton />
        </div>
      </div>
      <Doc doc={doc} o={o} batch={batch} />
    </>
  )
}
