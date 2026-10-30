import Link from 'next/link'
import { findOrder, requireRole } from '@/lib/server'
import { getSettings } from '@/lib/settings'
import Doc, { docReady } from './Doc'
import { PrintButton } from '../../../../ui'

const pickBatch = (o, batchId) => batchId
  ? (o.batches || []).find((b) => String(b.id) === String(batchId) || String(b.batch_no) === String(batchId))
  : (o.batches || [])[(o.batches || []).length - 1]

// The title is also the file name Chrome suggests for "Save as PDF": just the document number.
export async function generateMetadata({ params, searchParams }) {
  const { id, doc } = await params
  const o = await findOrder(id, await requireRole())
  if (!o) return {}
  const b = pickBatch(o, (await searchParams)?.batch)
  const no = doc === 'quote' ? o.quote_no : (doc === 'do' ? b?.do_no : b?.pi_no) || o.doc_no || o.quote_no
  return { title: { absolute: no } }
}

export default async function PrintPage({ params, searchParams }) {
  const me = await requireRole()
  const { id, doc } = await params
  const sp = await searchParams
  const o = await findOrder(id, me)
  const batch = o && pickBatch(o, sp?.batch)

  // Under the "Print Document" heading, say what is missing instead of a bare "Not found".
  if (!o || !docReady(doc, o, batch)) {
    return (
      <div className="empty">
        <i className="ph ph-file-dashed" />
        <h3>This document isn't available</h3>
        <p>{o ? `It hasn't been generated for ${o.quote_no} yet.` : "The order doesn't exist, or you don't have access to it."}</p>
        <Link prefetch={false} href={o ? `/orders?view=${o.id}` : '/orders'} className="btn btn-primary btn-sm"><i className="ph ph-arrow-left" />{o ? `Back to ${o.quote_no}` : 'Back to Orders'}</Link>
      </div>
    )
  }
  return (
    <>
      <div className="page-head no-print">
        <Link prefetch={false} href={`/orders?view=${o.id}`} className="btn btn-ghost btn-sm"><i className="ph ph-arrow-left" />Back to {o.quote_no}</Link>
        <div className="acts">
          <span className="muted text-sm print-hint">Choose “Save as PDF” as the printer to get a PDF file.</span>
          <PrintButton />
        </div>
      </div>
      <div className="doc-scroll"><Doc doc={doc} o={o} batch={batch} s={await getSettings()} /></div>
    </>
  )
}
