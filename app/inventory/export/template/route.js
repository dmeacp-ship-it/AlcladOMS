import { requireRole } from '@/lib/server'
import { invMasters } from '@/lib/inventory'
import { csvResponse, toCSV } from '@/lib/csv'

// Download pre-filled Raw Material opening stock template containing all 2,203 active materials.
export async function GET() {
  await requireRole('manager')
  const { stores, materials } = await invMasters()
  const rmStore = stores.find((s) => s.type === 'RM') || stores[0]
  const storeCode = rmStore?.code || 'RM-01'

  const rows = materials.map((m) => ({
    store_code: storeCode,
    material_code: m.code,
    material_name: m.name,
    uom: m.uom || 'KG',
    qty: '',
  }))

  return csvResponse('rm-opening-stock-template', toCSV(rows, [
    ['store_code', (r) => r.store_code],
    ['material_code', (r) => r.material_code],
    ['material_name', (r) => r.material_name],
    ['uom', (r) => r.uom],
    ['qty', (r) => r.qty],
  ]))
}
