import { QUEUES, db } from '@/lib/server'
import { getSettings } from '@/lib/settings'
import { totals } from '@/lib/tas'

// Everything the quotation form needs, for New Quotation and the admin Edit order page.
// skipOrder: the order being edited, left out of its customer's open-orders total.
export async function quoteFormData(me, skipOrder) {
  // Sales users see the customers assigned to them plus unassigned ones.
  let cq = db().from('customers').select('*').order('name')
  if (me.role === 'sales') cq = cq.or(`salesperson_id.is.null,salesperson_id.eq.${me.id}`)
  // ponytail: Supabase returns max 1000 rows; switch the customer picker to search past that.
  const [{ data: customers }, { data: options }, { data: salespersons }, s] = await Promise.all([
    cq,
    db().rpc('item_options'),
    db().from('profiles').select('id, full_name').in('role', ['sales', 'admin']).eq('active', true).order('full_name'),
    getSettings(),
  ])

  // Credit: what each customer with a limit already has in open (active) orders.
  const limited = (customers || []).filter((c) => c.credit_limit != null).map((c) => c.id)
  const exposure = {}
  if (limited.length) {
    const { data: open } = await QUEUES.ACTIVE(db().from('orders').select('id, customer_id, transport, vat_rate, items:order_items(total)').in('customer_id', limited))
    for (const o of open || []) {
      if (String(o.id) === String(skipOrder)) continue
      exposure[o.customer_id] = (exposure[o.customer_id] || 0) + totals(o.items, o.transport, o.vat_rate).total
    }
  }
  return {
    customers: customers || [],
    options: options || {},
    salespersons: me.role === 'sales' ? null : salespersons || [],
    exposure,
    vatRate: Number(s.vat_pct) / 100,
  }
}
