import { db, findOrder, getOrder, requireRole } from '@/lib/server'
import QuoteForm from '../../new/QuoteForm'
import { quoteFormData } from '../../new/data'

export async function generateMetadata({ params }) {
  const o = await findOrder((await params).id, await requireRole('admin'))
  return { title: o ? `Edit ${o.quote_no}` : 'Edit order' }
}

const ATTRS = ['brand', 'color_code', 'grade', 'core', 'skin', 'width', 'length', 'thickness', 'qty', 'price']

// Admin: correct an order that was filled in wrongly (the quotation form, prefilled).
export default async function EditOrder({ params }) {
  const me = await requireRole('admin')
  const o = await getOrder((await params).id, me)
  const [data, { data: onDo }] = await Promise.all([
    quoteFormData(me, o.id),
    db().from('batch_items').select('order_item_id').in('order_item_id', o.items.map((it) => it.id)),
  ])
  const locked = new Set((onDo || []).map((r) => r.order_item_id))
  // The order's customer may have been deleted from the master since: keep it pickable.
  if (o.customer_id && !data.customers.some((c) => c.id === o.customer_id)) {
    data.customers.unshift({ id: o.customer_id, code: o.customer_code, name: o.customer_name, address: o.address, cr_no: o.cr_no, vat_no: o.vat_no, mobile: o.contact_no })
  }
  return (
    <QuoteForm
      {...data}
      me={me}
      edit={{ id: o.id, quote_no: o.quote_no, quote_date: o.quote_date, vat_rate: o.vat_rate }}
      initial={{
        customer_id: o.customer_id ? String(o.customer_id) : '',
        salesperson_id: o.salesperson_id || '',
        transport: String(o.transport ?? 0),
        notes: o.notes || '',
        lines: o.items.map((it) => ({
          ...Object.fromEntries(ATTRS.map((k) => [k, it[k] == null ? '' : String(it[k])])),
          id: String(it.id),
          min: Number(it.dispatched_qty || 0),
          locked: locked.has(it.id) || Number(it.dispatched_qty) > 0,
        })),
      }}
    />
  )
}
