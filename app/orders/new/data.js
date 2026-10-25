import { unstable_cache } from 'next/cache'
import { QUEUES, batchQueues, db } from '@/lib/server'
import { getSettings } from '@/lib/settings'
import { totals } from '@/lib/tas'

// Customers, item lists and salespeople change only through admin pages, so they stay in Next's data cache
// until an admin saves anything (updateTag('masters') in app/admin/actions.js).
const masters = unstable_cache(async () => {
  const [{ data: customers }, { data: options }, { data: salespersons }] = await Promise.all([
    db().from('customers').select('*').order('name'),
    db().rpc('item_options'),
    db().from('profiles').select('id, full_name').in('role', ['sales', 'admin']).eq('active', true).order('full_name'),
  ])
  return { customers: customers || [], options: options || {}, salespersons: salespersons || [] }
}, ['quote-masters'], { tags: ['masters'] })

// Everything the quotation form needs, for New Quotation and the admin Edit order page.
// skipOrder: the order being edited, left out of its customer's open-orders total.
export async function quoteFormData(me, skipOrder) {
  // ponytail: Supabase returns max 1000 rows; switch the customer picker to search past that.
  const [m, s] = await Promise.all([masters(), getSettings()])
  // Sales users see the customers assigned to them plus unassigned ones.
  const customers = me.role === 'sales' ? m.customers.filter((c) => !c.salesperson_id || c.salesperson_id === me.id) : m.customers
  const { options, salespersons } = m

  // Credit: what each customer with a limit already has in open (active) orders.
  const limited = (customers || []).filter((c) => c.credit_limit != null).map((c) => c.id)
  const exposure = {}
  if (limited.length) {
    const { data: open } = await QUEUES.ACTIVE(db().from('orders').select('id, customer_id, transport, vat_rate, items:order_items(total)').in('customer_id', limited), await batchQueues())
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
