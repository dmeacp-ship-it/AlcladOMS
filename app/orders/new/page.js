import { db, getOrder, requireRole } from '@/lib/server'
import QuoteForm from './QuoteForm'

export const metadata = { title: 'New Quotation' }

export default async function NewQuote({ searchParams }) {
  const me = await requireRole('sales')
  // ?from=<order id>: start from a copy of an earlier (e.g. rejected) quotation.
  const from = (await searchParams).from
  const src = from ? await getOrder(from, me) : null
  // ponytail: Supabase returns max 1000 rows; switch the customer picker to search past that.
  const [{ data: customers }, { data: options }, { data: salespersons }] = await Promise.all([
    db().from('customers').select('*').order('name'),
    db().rpc('item_options'),
    db().from('profiles').select('id, full_name').in('role', ['sales', 'admin']).eq('active', true).order('full_name'),
  ])
  return (
    <QuoteForm
      customers={customers || []}
      options={options || {}}
      salespersons={me.role === 'sales' ? null : salespersons || []}
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
