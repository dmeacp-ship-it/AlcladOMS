import Link from 'next/link'
import { requireRole } from '@/lib/server'
import { period, sales } from '@/lib/reports'
import ReportsHead from '../ReportsHead'
import SalesTable from '../SalesTable'

export const metadata = { title: 'Customers · Reports' }

// Every customer with quotes in the period, by approved value; ?q= narrows by name or code.
export default async function Customers({ searchParams }) {
  await requireRole('admin')
  const sp = await searchParams
  const p = period(sp)
  const term = String(sp.q || '').trim()
  const { byCustomer } = await sales(p)
  const t = term.toLowerCase()
  const rows = t ? byCustomer.filter((g) => g.name.toLowerCase().includes(t) || (g.code || '').toLowerCase().includes(t)) : byCustomer
  return (
    <>
      <ReportsHead tab="customers" p={p} exports={[['orders', 'Orders'], ['lines', 'Order lines']]} />
      <SalesTable title="By customer" icon="ph-storefront" nameLabel="Customer" showCode rows={rows}
        empty={term ? `No customer matches “${term}”` : 'No quotes in this period'}>
        <form className="tbl-filters">
          <input type="hidden" name="from" value={p.from} />
          <input type="hidden" name="to" value={p.to} />
          <div className="sw">
            <i className="ph ph-magnifying-glass" />
            <input className="tsearch" name="q" defaultValue={term} placeholder="Customer name or code" aria-label="Search customers" />
          </div>
          {term && <Link className="btn btn-ghost btn-sm neutral" href={`/admin/reports/customers?${p.qs}`}>Clear</Link>}
        </form>
      </SalesTable>
    </>
  )
}
