import { requireRole } from '@/lib/server'
import { fgReport } from '@/lib/production'
import { csvResponse, toCSV } from '@/lib/csv'
import { round2, today } from '@/lib/tas'

// FG stock report as CSV, with the same filters as /production/fg.
export async function GET(req) {
  await requireRole('manager')
  const { rows, p, error } = await fgReport(Object.fromEntries(new URL(req.url).searchParams))
  if (error) return new Response('Could not build the export. Try again; if it keeps failing, tell the admin.', { status: 500 })
  return csvResponse(`fg-stock-${p.from}-to-${p.to}-${today()}`, toCSV(rows, [
    ['Plant', (r) => r.plant_code], ['Store', (r) => r.store], ['Item', (r) => r.code], ['Colour', (r) => r.color_name],
    ['B-grade', (r) => (r.b_grade ? 'Yes' : '')], ['M2 per pc', (r) => r.m2_per_pc], ['Opening pcs', (r) => r.opening],
    ['In pcs', (r) => r.inward], ['Out pcs', (r) => r.outward], ['Closing pcs', (r) => r.closing],
    ['Closing M2', (r) => round2(r.closing * r.m2_per_pc)],
  ]))
}
