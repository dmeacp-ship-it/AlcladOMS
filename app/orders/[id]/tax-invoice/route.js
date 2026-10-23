import { getOrder, requireRole } from '@/lib/server'
import { openInvoice } from '@/lib/drive'

// Drive files are streamed through here; older Supabase uploads get a one-minute signed link.
export async function GET(req, { params }) {
  const me = await requireRole()
  const o = await getOrder((await params).id, me)
  const bid = new URL(req.url).searchParams.get('batch')
  const file = bid ? (o.batches || []).find((b) => String(b.id) === bid)?.tax_invoice_path : o.tax_invoice_path
  if (!file) return new Response('No tax invoice uploaded.', { status: 404 })
  try {
    return await openInvoice(file)
  } catch (e) {
    console.error('tax invoice open:', e.message)
    return new Response('Could not open the tax invoice file. Try again in a moment.', { status: 500 })
  }
}
