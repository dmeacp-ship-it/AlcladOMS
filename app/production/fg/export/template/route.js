import { requireRole } from '@/lib/server'
import { invMasters } from '@/lib/inventory'
import { csvResponse, toCSV } from '@/lib/csv'
import catalog from '@/lib/fg-catalog.json'

// Download pre-filled Finished Goods opening stock template containing all 3,800 standard products.
export async function GET() {
  await requireRole('manager')
  const { stores } = await invMasters()
  const fgStore = stores.find((s) => s.type === 'FG') || stores[0]
  const storeCode = fgStore?.code || 'FG-01'

  const rows = catalog.map((item) => ({
    store_code: storeCode,
    brand: item.brand,
    grade: item.grade,
    color_code: item.color_code,
    color_name: item.color_name,
    core: item.core,
    skin: item.skin != null ? item.skin : '',
    width: item.width != null ? item.width : '',
    length: item.length != null ? item.length : '',
    thickness: item.thickness != null ? item.thickness : '',
    pcs: '',
  }))

  return csvResponse('fg-opening-stock-template', toCSV(rows, [
    ['store_code', (r) => r.store_code],
    ['brand', (r) => r.brand],
    ['grade', (r) => r.grade],
    ['color_code', (r) => r.color_code],
    ['color_name', (r) => r.color_name],
    ['core', (r) => r.core],
    ['skin', (r) => r.skin],
    ['width', (r) => r.width],
    ['length', (r) => r.length],
    ['thickness', (r) => r.thickness],
    ['pcs', (r) => r.pcs],
  ]))
}
