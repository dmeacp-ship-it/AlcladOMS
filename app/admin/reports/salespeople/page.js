import { requireRole } from '@/lib/server'
import { period, sales } from '@/lib/reports'
import ReportsHead from '../ReportsHead'
import SalesTable from '../SalesTable'

export const metadata = { title: 'Salespeople · Reports' }

// Every salesperson's quotes in the period, by quote date.
export default async function Salespeople({ searchParams }) {
  await requireRole('manager') // admin + manager
  const p = period(await searchParams)
  const { bySales } = await sales(p)
  return (
    <>
      <ReportsHead tab="salespeople" p={p} exports={[['orders', 'Orders'], ['lines', 'Order lines']]} />
      <SalesTable title="By salesperson" icon="ph-user" nameLabel="Salesperson" rows={bySales} empty="No quotes in this period" />
    </>
  )
}
