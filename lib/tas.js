// Company settings, roles and the quotation maths. Safe to import from client components.

export const COMPANY = {
  NAME: 'TAS INTERNATIONAL MANUFACTURING COMPANY',
  ADDRESS: 'Building No: 4252, Secondary No: 8797, Po Box No: 16417, Street Name: Al Dilam 395, Street No: 26, City: Al Kharj Industrial City',
  HELPLINE: '+966 53 246 4444',
  EMAIL: 'info@alclad.com.sa',
  CR_NO: '7040692464',
  VAT_NO: '312358533600003',
  BANK_NAME: 'Alinma bank',
  SWIFT: 'INMASARIXXX',
  BANK_ACC: '68 2057 6816 8000',
  IBAN: 'SA9505000068205768168000',
  BANK_ACC_USD: '84 0057 6816 8001',
  IBAN_USD: 'SA7805000084005768168001',
}
export const VAT_RATE = 0.15

export const ROLES = ['admin', 'manager', 'sales', 'approver', 'operations', 'accounts', 'plant']
// Plant status of a DO line until it is dispatched; Coil N/A carries the date the coil is expected.
export const PRODUCTION = ['Pending', 'Under Production', 'Ready for Dispatch', 'Coil N/A']

// Admin can do everything; anyone else needs one of the listed roles.
// Admin can do everything. Manager can do every workflow step (sales, approval, DO, PI, plant) but nothing
// admin-only: requireRole('admin') and the role === 'admin' checks (settings, masters, users, edit / delete
// orders, reports, activity log) stay closed to them.
export const can = (me, ...roles) =>
  me.role === 'admin' || (me.role === 'manager' && !(roles.length === 1 && roles[0] === 'admin')) || roles.includes(me.role)

// Inventory (migrate-015). GRANULE stores / materials are kept for the granules plant later.
export const STORE_TYPES = ['RM', 'WIP', 'FG', 'SCRAP', 'GRANULE']
export const MATERIAL_CATEGORIES = ['RM', 'CONSUMABLE', 'GRANULE', 'SCRAP']
export const PO_STATUS = { PENDING: ['Pending approval', 'b-warn'], APPROVED: ['Approved', 'b-ok'], REJECTED: ['Rejected', 'b-bad'], CLOSED: ['Closed', 'b-none'] }
// Quantities as people read them: up to 3 decimals (kg), no trailing zeros.
export const qty = (n) => (n === null || n === undefined || n === '' ? '' : Number(n).toLocaleString('en-US', { maximumFractionDigits: 3 }))

// Admin master screens: table -> editable columns.
export const MASTERS = {
  customers: {
    title: 'Customers', icon: 'ph-buildings', search: 'name', required: ['code', 'name'],
    // salesperson_id (assigned salesperson) is edited separately, as a pick-list
    cols: ['code', 'name', 'type', 'country', 'address', 'cr_no', 'vat_no', 'mobile', 'email', 'credit_limit'],
    numbers: ['credit_limit'],
  },
  // Inventory masters. options = fixed pick-lists; refs = pick-list of another master's codes.
  plants: { title: 'Plants', icon: 'ph-factory', search: 'name', required: ['code', 'name'], cols: ['code', 'name', 'address'] },
  stores: {
    title: 'Stores', icon: 'ph-warehouse', search: 'name', required: ['plant_code', 'code', 'name', 'type'],
    cols: ['plant_code', 'code', 'name', 'type'], refs: { plant_code: 'plants' }, options: { type: STORE_TYPES },
    labels: { type: { RM: 'Raw material store', WIP: 'Production line', FG: 'Finished goods store', SCRAP: 'Scrap store', GRANULE: 'Granules store' } },
  },
  materials: {
    title: 'Materials', icon: 'ph-package', search: 'name', required: ['code', 'name', 'category', 'uom'],
    cols: ['code', 'name', 'category', 'mat_type', 'thickness', 'width', 'uom', 'min_level', 'max_level'],
    numbers: ['thickness', 'width', 'min_level', 'max_level'], options: { category: MATERIAL_CATEGORIES }, defaults: { category: 'RM', uom: 'KG' },
  },
  vendors: { title: 'Vendors', icon: 'ph-truck', search: 'name', required: ['code', 'name'], cols: ['code', 'name', 'vat_no', 'mobile', 'email', 'address'] },
}

// Item master = one list per column, like the Google Sheet (item_lists, migrate-010). A quote line
// picks one value from each; the combination and its description exist only on the order.
// header = column name in the CSV template / export; colour carries a second column for its name.
export const ITEM_LISTS = [
  { key: 'brand', label: 'Brand', header: 'Brand' },
  { key: 'color', label: 'Color', header: 'Color Code', nameHeader: 'Color Name' },
  { key: 'grade', label: 'Grade', header: 'Grade' },
  { key: 'core', label: 'Core', header: 'Core' },
  { key: 'skin', label: 'Al Skin Thickness', header: 'Al Skin Thickness', number: true },
  { key: 'width', label: 'Width', header: 'Width', number: true },
  { key: 'length', label: 'Length', header: 'Length', number: true },
  { key: 'thickness', label: 'Thickness', header: 'Thickness', number: true },
  { key: 'uom', label: 'UoM', header: 'UoM' },
]

// Master column name -> header / label text: 'vat_no' -> 'VAT No'.
export const colLabel = (c) => c.replace(/_/g, ' ').replace(/\b\w/g, (x) => x.toUpperCase()).replace(/\b(Cr|Vat|Uom)\b/g, (x) => x.toUpperCase())

export const round2 =(n) => Math.round((Number(n) || 0) * 100) / 100

// Panel area: width (mm) x length (mm) x pieces.
export const calcM2 = (w, l, qty) => (w > 0 && l > 0 && qty > 0 ? round2((w * l * qty) / 1e6) : 0)

// Priced per M2 when the size is known, otherwise per piece.
export const lineTotal = (m2, qty, price) => round2((m2 > 0 ? m2 : qty) * price)

// rate: the order's own vat_rate (orders keep the rate they were quoted with).
export function totals(lines, transport, rate = VAT_RATE) {
  const subtotal = round2(lines.reduce((s, l) => s + (Number(l.total) || 0), 0))
  const trans = round2(transport)
  const vat = round2((subtotal + trans) * (Number(rate ?? VAT_RATE)))
  return { subtotal, transport: trans, vat, total: round2(subtotal + trans + vat) }
}

// Same as the sheet formula: BRAND-GRADE-COLOR-W*L*TMM
export const describe = (l) =>
  [l.brand, l.grade, l.color_code].filter(Boolean).join('-') +
  (l.width ? `-${l.width}*${l.length}*${l.thickness}MM` : '')

// After the DO the plant dispatches each line, in parts if needed: delivered_qty is the DO qty,
// dispatched_qty what has gone out. orders.dispatch_status holds the same for the whole order.
export const DISPATCH = {
  PENDING: ['Awaiting dispatch', 'b-none'],
  PARTIAL: ['Partly dispatched', 'b-info'],
  DISPATCHED: ['Dispatched', 'b-ok'],
  SHORT_CLOSED: ['Short closed', 'b-org'],
}
// Order status as people read it (the database keeps the upper-case words).
export const STATUS = { PENDING: 'Pending approval', APPROVED: 'Approved', REJECTED: 'Rejected', CANCELLED: 'Cancelled' }
export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
export function dispatchStatus(it) {
  const done = Number(it.dispatched_qty) || 0
  return done <= 0 ? 'PENDING' : done < (Number(it.delivered_qty) || 0) ? 'PARTIAL' : 'DISPATCHED'
}
// Pieces of a line still to dispatch, and pieces the plant marked ready (older rows kept it in delivered_qty).
export const balanceOf = (it) => Math.max(0, Number(it.qty) - (Number(it.dispatched_qty) || 0))
export const readyOf = (it) => Number(it.ready_qty != null ? it.ready_qty : (it.delivered_qty || 0))
export const dispatchOpen = (o) => o.status === 'APPROVED' && !['SHORT_CLOSED', 'DISPATCHED'].includes(o.dispatch_status)

// The part of an order that the documents menu and the action dialogs (client components, dialogs built when
// opened) read: the lines only while an action needs them (approval total, lines ready for a DO), batch lines only
// for a DO still waiting for its PI. Keeps a list row or the order dialog from sending every column of every line.
export const actionData = (o) => ({
  id: o.id, quote_no: o.quote_no, customer_name: o.customer_name, status: o.status, dispatch_status: o.dispatch_status,
  doc_no: o.doc_no, do_date: o.do_date, pi_date: o.pi_date, tax_invoice_path: o.tax_invoice_path, transport: o.transport, vat_rate: o.vat_rate,
  items: o.status === 'PENDING' ? o.items.map(({ total }) => ({ total }))
    : o.status === 'APPROVED' ? o.items.filter((it) => readyOf(it) > 0 && balanceOf(it) > 0)
      .map(({ id, item_no, description, qty, ready_qty, delivered_qty, dispatched_qty }) => ({ id, item_no, description, qty, ready_qty, delivered_qty, dispatched_qty }))
    : [],
  batches: (o.batches || []).map((b) => ({
    id: b.id, batch_no: b.batch_no, do_no: b.do_no, pi_no: b.pi_no, do_date: b.do_date, pi_date: b.pi_date, tax_invoice_path: b.tax_invoice_path,
    items: b.pi_no && b.pi_date ? [] : (b.items || []).map((bi) => ({ id: bi.id, do_qty: bi.do_qty, order_item: { description: bi.order_item?.description, price: bi.order_item?.price } })),
  })),
})

export const vatPct = (rate) => `${round2(Number(rate ?? VAT_RATE) * 100)}%`

export const money = (n) =>
  (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const int = (n) => (n === null || n === undefined || n === '' ? '' : Number(n).toLocaleString('en-US'))

// 'YYYY-MM-DD' -> 'DD.MM.YYYY' (printed TAS documents and CSV exports)
export const dmy = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('.') : '')
// On-screen dates: '24 Oct 2026'. A timestamp is read in Riyadh time, a plain date as it is.
export const day = (d) => {
  if (!d) return ''
  const s = String(d)
  const plain = /^\d{4}-\d{2}-\d{2}$/.test(s)
  return new Date(plain ? `${s}T00:00:00Z` : s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: plain ? 'UTC' : 'Asia/Riyadh' })
}
export const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' })
