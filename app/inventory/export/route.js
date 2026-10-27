import { requireRole } from '@/lib/server'
import { stockReport } from '@/lib/inventory'
import { csvResponse, toCSV } from '@/lib/csv'
import { today } from '@/lib/tas'

// Stock report as CSV, with the same filters as /inventory.
export async function GET(req) {
  await requireRole('manager')
  const { rows, p, error } = await stockReport(Object.fromEntries(new URL(req.url).searchParams))
  if (error) return new Response('Could not build the export. Try again; if it keeps failing, tell the admin.', { status: 500 })
  return csvResponse(`stock-${p.from}-to-${p.to}-${today()}`, toCSV(rows, [
    ['Plant', (r) => r.plant_code], ['Store', (r) => r.store], ['Material Code', (r) => r.code], ['Material', (r) => r.name],
    ['Category', (r) => r.category], ['UoM', (r) => r.uom], ['Opening', (r) => r.opening], ['In', (r) => r.inward],
    ['Out', (r) => r.outward], ['Closing', (r) => r.closing], ['Min Level', (r) => r.min_level], ['Max Level', (r) => r.max_level],
  ]))
}
