import { notFound } from 'next/navigation'
import { db, fetchAll as all, filterOrders, requireRole } from '@/lib/server'
import { activityQuery, stamp } from '@/lib/activity'
import { csvResponse, itemListsCSV, toCSV } from '@/lib/csv'
import { ITEM_LISTS, MASTERS, balanceOf, dmy, round2, totals, today } from '@/lib/tas'

// Excel downloads (CSV) for admins: /admin/export/<what>?from=YYYY-MM-DD&to=…&status=…&q=…
const isDay = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || '')
const period = (q, col, sp) => {
  if (isDay(sp.from)) q = q.gte(col, sp.from)
  if (isDay(sp.to)) q = q.lte(col, sp.to)
  return q
}
const orderTotal = (o) => totals(o.items || [], o.transport, o.vat_rate)

const EXPORTS = {
  orders: async (sp) => {
    const term = String(sp.q || '').replace(/[,()*%]/g, '').trim()
    const rows = await all(() => {
      let q = period(filterOrders(db().from('orders').select('*, items:order_items(qty, total), batches:order_batches(do_no, pi_no)'), sp.status || ''), 'quote_date', sp).order('id')
      if (term) q = q.or(`quote_no.ilike.%${term}%,customer_name.ilike.%${term}%,doc_no.ilike.%${term}%`)
      return q
    })
    return toCSV(rows, [
      ['Quote No', (o) => o.quote_no], ['Quote Date', (o) => dmy(o.quote_date)], ['Customer Code', (o) => o.customer_code],
      ['Customer', (o) => o.customer_name], ['Salesperson', (o) => o.salesperson_name], ['Status', (o) => o.status],
      ['Dispatch', (o) => o.dispatch_status], ['Lines', (o) => o.items.length], ['Qty (PCS)', (o) => o.items.reduce((n, i) => n + Number(i.qty), 0)],
      ['Subtotal', (o) => orderTotal(o).subtotal], ['Transport', (o) => orderTotal(o).transport], ['VAT', (o) => orderTotal(o).vat],
      ['Total (SAR)', (o) => orderTotal(o).total], ['DO Nos', (o) => o.batches.map((b) => b.do_no).filter(Boolean).join(' ')],
      ['PI Nos', (o) => o.batches.map((b) => b.pi_no).filter(Boolean).join(' ')], ['Tax Invoice', (o) => (o.tax_invoice_path ? 'Yes' : 'No')],
      ['Approved / Rejected By', (o) => o.action_by], ['Reason', (o) => o.reject_reason || o.short_close_reason], ['Notes', (o) => o.notes],
    ])
  },
  lines: async (sp) => {
    const rows = await all(() => period(db().from('order_items').select('*, order:orders!inner(quote_no, quote_date, customer_name, status)'), 'order.quote_date', sp).order('order_id').order('item_no'))
    return toCSV(rows, [
      ['Quote No', (r) => r.order.quote_no], ['Quote Date', (r) => dmy(r.order.quote_date)], ['Customer', (r) => r.order.customer_name],
      ['Order Status', (r) => r.order.status], ['Line', (r) => r.item_no], ['Description', (r) => r.description], ['Color', (r) => r.color_name],
      ['Qty (PCS)', (r) => r.qty], ['M2', (r) => r.m2], ['Unit Price', (r) => r.price], ['Total', (r) => r.total],
      ['Plant Status', (r) => r.production_status], ['Dispatched', (r) => r.dispatched_qty], ['Balance', (r) => balanceOf(r)],
    ])
  },
  dispatches: async (sp) => {
    const rows = await all(() => period(db().from('dispatches').select('*, order:orders(quote_no, customer_name), item:order_items(item_no, description)'), 'dispatch_date', sp).order('dispatch_date').order('id'))
    return toCSV(rows, [
      ['Date', (r) => dmy(r.dispatch_date)], ['Quote No', (r) => r.order?.quote_no], ['Customer', (r) => r.order?.customer_name],
      ['Line', (r) => r.item?.item_no], ['Description', (r) => r.item?.description], ['Qty (PCS)', (r) => r.qty],
      ['Vehicle No', (r) => r.vehicle_no], ['Transporter', (r) => r.transporter], ['LR No', (r) => r.lr_no], ['Driver', (r) => r.driver], ['By', (r) => r.by_name],
    ])
  },
  invoices: async (sp) => {
    const rows = await all(() => period(db().from('order_batches').select('*, items:batch_items(invoiced_qty, invoiced_total), order:orders(quote_no, customer_code, customer_name, vat_no, vat_rate)').not('pi_no', 'is', null), 'pi_date', sp).order('pi_date').order('id'))
    const t = (b) => totals((b.items || []).map((i) => ({ total: i.invoiced_total })), b.transport, b.order?.vat_rate)
    return toCSV(rows, [
      ['PI No', (b) => b.pi_no], ['PI Date', (b) => dmy(b.pi_date)], ['DO No', (b) => b.do_no], ['Quote No', (b) => b.order?.quote_no],
      ['Customer Code', (b) => b.order?.customer_code], ['Customer', (b) => b.order?.customer_name], ['Customer VAT No', (b) => b.order?.vat_no],
      ['Qty (PCS)', (b) => round2((b.items || []).reduce((n, i) => n + Number(i.invoiced_qty || 0), 0))],
      ['Subtotal', (b) => t(b).subtotal], ['Transport', (b) => t(b).transport], ['VAT', (b) => t(b).vat], ['Total (SAR)', (b) => t(b).total],
      ['Tax Invoice Uploaded', (b) => (b.tax_invoice_path ? 'Yes' : 'No')], ['Price Note', (b) => b.price_note], ['By', (b) => b.pi_by],
    ])
  },
  customers: async () => {
    const rows = await all(() => db().from('customers').select('*, sp:profiles(full_name)').order('id'))
    return toCSV(rows, [...MASTERS.customers.cols.map((c) => [c, (r) => r[c]]), ['salesperson', (r) => r.sp?.full_name]])
  },
  // Item master in the sheet layout (one column per list); items-template = headers + one example row.
  items: async () => {
    const rows = await all(() => db().from('item_lists').select('list, value, name').order('id'))
    const lists = {}
    for (const r of rows) (lists[r.list] ??= []).push(r)
    for (const d of ITEM_LISTS) if (d.number) lists[d.key]?.sort((a, b) => a.value - b.value)
    return itemListsCSV(lists, ITEM_LISTS)
  },
  'items-template': async () => itemListsCSV({
    brand: [{ value: 'ALUMAX' }], color: [{ value: 'AL4001', name: 'Industrial Ash' }], grade: [{ value: 'AL4025' }],
    core: [{ value: 'NFR' }], skin: [{ value: '0.2' }], width: [{ value: '1250' }], length: [{ value: '5600' }],
    thickness: [{ value: '4' }], uom: [{ value: 'M2' }],
  }, ITEM_LISTS),
  activity: async (sp) => {
    const rows = await all(() => activityQuery(sp))
    return toCSV(rows, [
      ['When', (e) => stamp(e.at)], ['User', (e) => e.by_name], ['Action', (e) => e.action], ['Order', (e) => e.order?.quote_no], ['Details', (e) => e.detail],
    ])
  },
}

export async function GET(req, { params }) {
  await requireRole('admin')
  const { what } = await params
  if (!EXPORTS[what]) notFound()
  const sp = Object.fromEntries(new URL(req.url).searchParams)
  try {
    return csvResponse(`${what}-${today()}`, await EXPORTS[what](sp))
  } catch (e) {
    console.error(`export ${what}:`, e.message)
    return new Response('Could not build the export. Try again; if it keeps failing, tell the admin.', { status: 500 })
  }
}
