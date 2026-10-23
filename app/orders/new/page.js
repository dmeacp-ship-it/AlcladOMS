import { getOrder, requireRole } from '@/lib/server'
import QuoteForm from './QuoteForm'
import { quoteFormData } from './data'

export const metadata = { title: 'New Quotation' }

export default async function NewQuote({ searchParams }) {
  const me = await requireRole('sales')
  // ?from=<order id>: start from a copy of an earlier (e.g. rejected) quotation.
  const from = (await searchParams).from
  const src = from ? await getOrder(from, me) : null
  return (
    <QuoteForm
      {...await quoteFormData(me)}
      me={me}
      initial={src && {
        customer_id: src.customer_id ? String(src.customer_id) : '',
        transport: String(src.transport ?? 0),
        notes: src.notes || '',
        lines: src.items.map((it) => Object.fromEntries(
          ['brand', 'color_code', 'grade', 'core', 'skin', 'width', 'length', 'thickness', 'qty', 'price'].map((k) => [k, it[k] == null ? '' : String(it[k])]))),
      }}
    />
  )
}
