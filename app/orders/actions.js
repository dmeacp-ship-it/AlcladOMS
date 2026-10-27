'use server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { QUEUES, batchQueues, db, findOrder, getOrder, go, logEvent, requireRole } from '@/lib/server'
import { removeInvoices, saveInvoice } from '@/lib/drive'
import { getSettings } from '@/lib/settings'
import { fgPosition } from '@/lib/production'
import { DISPATCH, PRODUCTION, calcM2, day, describe, dispatchOpen, int, lineTotal, money, plural, readyOf, today, totals } from '@/lib/tas'

const num = (v) => (String(v ?? '').trim() === '' ? NaN : Number(v))
// After an action, land back where it was started: the order dialog, the list row or the plant page.
const back = (fd, id) => {
  const b = String(fd.get('back') || '')
  return /^\/(orders|plant)(\?|$)/.test(b) ? b : `/orders?view=${id}`
}
const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v)
const ATTRS = ['brand', 'color_code', 'grade', 'core', 'skin', 'width', 'length', 'thickness']

// Quotation form lines -> order_items rows, or { error }. Shared by createQuote and updateOrder.
// line_id is set on lines of an order being edited (empty for new lines).
async function parseLines(fd) {
  // Same rule as the sheet dropdowns: every attribute must exist in the Item Master.
  const { data: opt } = await db().rpc('item_options')
  const allowed = (k, v) => (opt?.[k] || []).some((x) => String(x) === v)

  const cols = Object.fromEntries(ATTRS.map((k) => [k, fd.getAll(k).map((v) => String(v).trim())]))
  const qtys = fd.getAll('qty')
  const prices = fd.getAll('price')
  const ids = fd.getAll('line_id')
  const items = []
  for (let i = 0; i < qtys.length; i++) {
    const l = Object.fromEntries(ATTRS.map((k) => [k, cols[k][i] || '']))
    const qty = num(qtys[i])
    const price = String(prices[i] ?? '').trim() === '' ? 0 : num(prices[i])
    if (!l.brand && !String(qtys[i]).trim() && !ids[i]) continue // untouched new line
    const row = `Line ${i + 1}: `
    if (!l.brand) return { error: row + 'select a Brand.' }
    if (!(qty > 0)) return { error: row + 'Qty (PCS) must be more than 0.' }
    if (!(price >= 0)) return { error: row + 'Unit price must be a number.' }
    for (const k of ATTRS) {
      if (l[k] && k !== 'color_code' && !allowed(k, l[k])) return { error: row + `"${l[k]}" is not a valid ${k.replace('_', ' ')}.` }
    }
    if (l.color_code && !opt?.color?.[l.color_code]) return { error: row + `"${l.color_code}" is not a valid color code.` }
    const m2 = calcM2(num(l.width), num(l.length), qty)
    items.push({
      line_id: ids[i] || null,
      item_no: items.length + 1,
      ...Object.fromEntries(ATTRS.map((k) => [k, l[k] || null])),
      color_name: opt?.color?.[l.color_code] || null,
      uom: 'M2',
      description: describe(l),
      qty, m2, price,
      total: lineTotal(m2, qty, price),
    })
  }
  if (!items.length) return { error: 'Enter at least one line item with Qty (PCS) more than 0.' }
  return { items }
}

// Customer details copied onto the order, so documents never change when the master is edited.
const snapshot = (c) => ({
  customer_id: c.id,
  customer_code: c.code,
  customer_name: c.name,
  address: c.country && !(c.address || '').includes(c.country) ? [c.address, c.country].filter(Boolean).join(', ') : c.address,
  cr_no: c.cr_no,
  vat_no: c.vat_no,
  contact_no: c.mobile,
})

// Credit check for the timeline: open orders of the customer plus this one, against its limit.
async function creditNote(c, total, skipOrder) {
  if (c.credit_limit == null) return ''
  const { data: open } = await QUEUES.ACTIVE(db().from('orders').select('id, transport, vat_rate, items:order_items(total)').eq('customer_id', c.id), await batchQueues())
  const used = (open || []).filter((o) => String(o.id) !== String(skipOrder))
    .reduce((s, o) => s + totals(o.items, o.transport, o.vat_rate).total, 0) + total
  return used > Number(c.credit_limit) ? ` · over credit limit: SAR ${money(used)} of ${money(c.credit_limit)}` : ''
}

// Called through useActionState, so errors are returned (keeps the typed form) instead of redirected.
export async function createQuote(_prev, fd) {
  const me = await requireRole('sales')
  const { data: c } = await db().from('customers').select('*').eq('id', fd.get('customer_id') || 0).maybeSingle()
  if (!c) return { error: 'Please select a customer.' }
  if (me.role === 'sales' && c.salesperson_id && c.salesperson_id !== me.id) return { error: 'This customer is assigned to another salesperson.' }

  let sp = me
  if (me.role !== 'sales') {
    ;({ data: sp } = await db().from('profiles').select('*').eq('id', fd.get('salesperson_id') || me.id).maybeSingle())
    if (!sp?.active) return { error: 'Please select a salesperson.' }
  }

  const { items, error: lineError } = await parseLines(fd)
  if (lineError) return { error: lineError }

  const s = await getSettings()
  const rate = Number(s.vat_pct) / 100
  const transport = num(fd.get('transport'))
  const { data: order, error } = await db().from('orders').insert({
    vat_rate: rate,
    ...snapshot(c),
    salesperson_id: sp.id,
    salesperson_name: sp.full_name,
    notes: String(fd.get('notes') || '').trim() || null,
    transport: transport > 0 ? transport : 0,
    created_by: me.id,
  }).select('id, quote_no').single()
  if (error) return { error: error.message }

  const { error: e2 } = await db().from('order_items').insert(items.map(({ line_id, ...it }) => ({ ...it, order_id: order.id })))
  if (e2) {
    await db().from('orders').delete().eq('id', order.id)
    return { error: e2.message }
  }
  const total = totals(items, transport > 0 ? transport : 0, rate).total
  await logEvent(order.id, me, 'Quotation created', `${items.length} line${items.length > 1 ? 's' : ''}${await creditNote(c, total, order.id)}`)

  // Approval rule (Settings → Rules): small quotes skip the approval queue.
  const auto = Number(s.auto_approve_below) > 0 && total < Number(s.auto_approve_below)
  if (auto) {
    await db().from('orders').update({ status: 'APPROVED', action_by: 'Auto-approved', action_at: new Date().toISOString() }).eq('id', order.id)
    await logEvent(order.id, { full_name: 'System' }, 'Approved', `Auto-approved: below SAR ${money(s.auto_approve_below)}`)
  }
  revalidatePath('/', 'layout')
  redirect(`/orders?ok=${encodeURIComponent(`Quotation ${order.quote_no} ${auto ? 'auto-approved' : 'submitted for approval'}.`)}`)
}

// Approve / reject replaces the old one-click email links.
export async function decide(fd) {
  const me = await requireRole('approver')
  const id = fd.get('id')
  const approve = fd.get('decision') === 'approve'
  const reason = String(fd.get('reason') || '').trim()
  if (!approve && !reason) go(back(fd, id), 'error', 'Enter a reason for rejection.')
  if (approve && me.role !== 'admin') {
    const limit = Number((await getSettings()).admin_approval_above)
    const o = await getOrder(id, me)
    if (limit > 0 && totals(o.items, o.transport, o.vat_rate).total > limit) {
      go(back(fd, id), 'error', `Quotes over SAR ${money(limit)} need an admin to approve.`)
    }
  }
  const { data } = await db().from('orders')
    .update({
      status: approve ? 'APPROVED' : 'REJECTED',
      action_by: me.full_name,
      action_at: new Date().toISOString(),
      reject_reason: approve ? null : reason,
    })
    .eq('id', id).eq('status', 'PENDING').select('quote_no')
  if (!data?.length) go(back(fd, id), 'error', 'This quotation is no longer pending.')
  await logEvent(id, me, approve ? 'Approved' : 'Rejected', approve ? null : reason)
  revalidatePath('/', 'layout')
  go(back(fd, id), 'ok', `Quotation ${data[0].quote_no} ${approve ? 'approved' : 'rejected'}.`)
}

// Plant status per order line (Pending, Under Production, Ready for Dispatch, Coil N/A).
export async function saveProduction(fd) {
  const me = await requireRole()
  const o = await getOrder(fd.get('id'), me)
  const path = back(fd, o.id)
  if (o.status !== 'APPROVED') go(path, 'error', 'Only approved orders can have plant status updated.')
  const changes = []
  for (const it of o.items) {
    const v = fd.get(`production_${it.id}`)
    if (!v || !PRODUCTION.includes(v)) continue
    const c = String(fd.get(`coil_${it.id}`) || '')
    const coil = v === 'Coil N/A' && isDate(c) ? c : null

    // If Ready for Dispatch, read ready quantity
    const rawReady = fd.get(`ready_${it.id}`)
    const curReady = Number(it.ready_qty != null ? it.ready_qty : (it.delivered_qty || 0))
    const balance = Math.max(0, Number(it.qty) - (Number(it.dispatched_qty) || 0))
    let readyQty = 0
    if (v === 'Ready for Dispatch') {
      const q = num(rawReady)
      readyQty = (!isNaN(q) && q > 0) ? Math.min(q, balance) : (curReady > 0 ? Math.min(curReady, balance) : balance)
    }

    if (v === it.production_status && coil === it.coil_date && readyQty === curReady) continue

    // 1. Update delivered_qty (guaranteed column in Supabase)
    await db().from('order_items').update({ delivered_qty: readyQty, coil_date: coil }).eq('id', it.id)

    // 2. Update production_status
    try {
      const test = await db().from('order_items').update({ production_status: v }).eq('id', it.id)
      if (test.error) {
        await db().from('order_items').update({ production_status: v === 'Ready for Dispatch' ? 'Under Production' : v }).eq('id', it.id)
      }
    } catch {
      await db().from('order_items').update({ production_status: v === 'Ready for Dispatch' ? 'Under Production' : v }).eq('id', it.id)
    }

    // 3. Try ready_qty if migrated
    try {
      await db().from('order_items').update({ ready_qty: readyQty }).eq('id', it.id)
    } catch {}

    changes.push(`Line ${it.item_no}: ${v}${v === 'Ready for Dispatch' ? ` (${readyQty} PCS ready)` : coil ? ` (coil ${day(coil)})` : ''}`)
  }
  if (changes.length) await logEvent(o.id, me, 'Plant status', changes.join('; '))
  revalidatePath('/', 'layout')
  go(path, 'ok', 'Plant status saved.')
}

// Mark lines ready for dispatch (plant or operations). The Plant Dispatch selection may hold lines of
// several orders: each order is checked and logged on its own.
export async function markReady(fd) {
  const me = await requireRole()
  const ids = [...new Set(fd.getAll('id').map(String))]
  const path = back(fd, ids[0])
  // Company Settings → "Orders use FG stock": ready pieces are an FG reservation, so they must be free in FG.
  // ponytail: checked here, not locked; the DO re-checks FG stock in the database.
  const fg = (await getSettings()).fg_link ? await fgPosition() : null
  let lines = 0
  for (const id of ids) {
    const o = await getOrder(id, me)
    if (o.status !== 'APPROVED') go(path, 'error', `${o.quote_no} is not approved, so its lines can't be marked ready.`)
    const changes = []
    for (const it of o.items) {
      const raw = fd.get('ready_' + it.id)
      if (raw === null) continue
      const q = num(raw)
      if (isNaN(q) || q < 0) continue
      const balance = Math.max(0, Number(it.qty) - (Number(it.dispatched_qty) || 0))
      // Input is the quantity to ADD on top of what is already ready (not yet on a DO).
      const curReady = Number(it.ready_qty != null ? it.ready_qty : (it.delivered_qty || 0))
      const added = Math.min(q, Math.max(0, balance - curReady))
      const validQty = curReady + added
      if (fg && added > 0) {
        const p = (fg[it.fg_item_id] ??= { free: 0 })
        if (added > p.free) go(path, 'error', `${o.quote_no} line ${it.item_no}: only ${Math.max(0, p.free)} pcs of ${it.description} are free in FG stock.`)
        p.free -= added // the next line of the same item sees what is left
      }

      // 1. Update delivered_qty (guaranteed column in Supabase)
      await db().from('order_items').update({ delivered_qty: validQty }).eq('id', it.id)

      // 2. Try updating production_status
      try {
        const pTest = await db().from('order_items').update({ production_status: 'Ready for Dispatch' }).eq('id', it.id)
        if (pTest.error) {
          await db().from('order_items').update({ production_status: validQty > 0 ? 'Under Production' : 'Pending' }).eq('id', it.id)
        }
      } catch {
        await db().from('order_items').update({ production_status: validQty > 0 ? 'Under Production' : 'Pending' }).eq('id', it.id)
      }

      // 3. Try ready_qty if migrated
      try {
        await db().from('order_items').update({ ready_qty: validQty }).eq('id', it.id)
      } catch {}

      if (added > 0) changes.push(`Line ${it.item_no}: +${added} PCS ready (${validQty} total)`)
    }
    if (changes.length) {
      await logEvent(o.id, me, 'Marked ready for dispatch', changes.join('; '))
      lines += changes.length
    }
  }

  if (!lines) go(path, 'error', 'Enter how many pieces are ready on at least one line.')
  revalidatePath('/', 'layout')
  go(path, 'ok', `${plural(lines, 'line')} marked ready for dispatch.`)
}

// Generate Delivery Order (Batch) and record physical dispatch (merged flow).
// Open to all roles.
export async function generateBatchDO(fd) {
  const me = await requireRole()
  const id = fd.get('id')
  const o = await getOrder(id, me)
  const path = back(fd, o.id)
  if (o.status !== 'APPROVED') go(path, 'error', 'Only approved orders can have a Delivery Order.')

  const date = String(fd.get('dispatch_date') || today())
  const str = (k) => String(fd.get(k) || '').trim().slice(0, 100)
  const vehicle_no = str('vehicle_no')
  const transporter = str('transporter')
  const lr_no = str('lr_no')
  const driver = str('driver')
  const transport = num(fd.get('transport')) || 0

  const lines = []
  for (const it of o.items) {
    const raw = fd.get('qty_' + it.id)
    if (raw === null) continue
    const q = num(raw)
    if (isNaN(q) || q <= 0) continue
    const balance = Number(it.qty) - (Number(it.dispatched_qty) || 0)
    if (q > balance) go(path, 'error', `Line ${it.item_no}: cannot deliver more than the balance (${balance} PCS).`)
    lines.push({ id: it.id, item: it, qty: q, m2: calcM2(it.width, it.length, q) })
  }

  if (!lines.length) go(path, 'error', 'Enter at least one item quantity to deliver & dispatch.')

  let doNo = null
  let batchId = null

  // Try RPC first
  const rpcRes = await db().rpc('generate_batch_do', {
    p_order: o.id,
    p_lines: lines.map((l) => ({ id: l.id, qty: l.qty, m2: l.m2 })),
    p_info: { date, vehicle_no, transporter, lr_no, driver, transport },
    p_by: me.full_name,
  })

  // The fallback below is only for a database without the function; a refusal from it (e.g. not enough FG
  // stock, migrate-017) is shown, never worked around.
  if (rpcRes.error && !/Could not find the function|does not exist/.test(rpcRes.error.message)) go(path, 'error', rpcRes.error.message)
  if (!rpcRes.error && rpcRes.data) {
    doNo = rpcRes.data
    const { data: bRow } = await db().from('order_batches').select('id').eq('order_id', o.id).eq('do_no', doNo).maybeSingle()
    batchId = bRow?.id
  } else {
    // Direct table updates fallback
    const custCode = o.customer_code || 'CUS'
    const todayStr = new Date().toLocaleDateString('en-GB', { timeZone: 'Asia/Riyadh' }).replace(/\//g, '').replace(/^(\d{4})\d\d(\d\d)$/, '$1$2')
    const prefix = `${(await getSettings()).do_prefix}-${custCode}-${todayStr}-`
    const { data: existing } = await db().from('order_batches').select('do_no').ilike('do_no', `${prefix}%`)
    const maxSeq = (existing || []).reduce((max, r) => {
      const n = parseInt(r.do_no?.slice(prefix.length) || '0', 10)
      return n > max ? n : max
    }, 0)
    const seqStr = String(maxSeq + 1).padStart(2, '0')
    doNo = `${prefix}${seqStr}`

    const { count } = await db().from('order_batches').select('*', { count: 'exact', head: true }).eq('order_id', o.id)
    const batchNo = (count || 0) + 1

    const { data: b, error: bErr } = await db().from('order_batches').insert({
      order_id: o.id,
      batch_no: batchNo,
      do_no: doNo,
      do_date: today(),
      do_by: me.full_name,
      dispatch_date: date,
      vehicle_no: vehicle_no || null,
      transporter: transporter || null,
      lr_no: lr_no || null,
      driver: driver || null,
      transport,
    }).select('id').single()

    if (bErr) go(path, 'error', bErr.message)
    batchId = b.id

    await db().from('batch_items').insert(lines.map((l) => ({
      batch_id: batchId,
      order_item_id: l.id,
      do_qty: l.qty,
      do_m2: l.m2,
    })))

    for (const l of lines) {
      const curDisp = Number(l.item.dispatched_qty) || 0
      const curReady = Number(l.item.ready_qty != null ? l.item.ready_qty : (l.item.delivered_qty || 0))
      const remReady = Math.max(0, curReady - l.qty)
      const newDisp = curDisp + l.qty
      const newBal = Math.max(0, Number(l.item.qty) - newDisp)
      const newStatus = newBal <= 0 ? 'Pending' : (remReady > 0 ? 'Ready for Dispatch' : 'Under Production')

      const p = {
        dispatched_qty: newDisp,
        delivered_qty: remReady,
      }
      try {
        const u = await db().from('order_items').update({ ...p, ready_qty: remReady, production_status: newStatus }).eq('id', l.id)
        if (u.error) await db().from('order_items').update(p).eq('id', l.id)
      } catch {
        await db().from('order_items').update(p).eq('id', l.id)
      }
    }

    await db().from('dispatches').insert(lines.map((l) => ({
      order_id: o.id,
      order_item_id: l.id,
      qty: l.qty,
      dispatch_date: date,
      vehicle_no: vehicle_no || null,
      transporter: transporter || null,
      lr_no: lr_no || null,
      driver: driver || null,
      by_name: me.full_name,
    })))

    const { data: allItems } = await db().from('order_items').select('qty, dispatched_qty').eq('order_id', o.id)
    const allDone = allItems?.every((it) => (Number(it.dispatched_qty) || 0) >= Number(it.qty))
    await db().from('orders').update({
      do_date: o.do_date || today(),
      doc_no: o.doc_no || doNo,
      do_by: o.do_by || me.full_name,
      dispatch_status: allDone ? 'DISPATCHED' : 'PARTIAL',
    }).eq('id', o.id)
  }

  const truckDesc = [vehicle_no && `Vehicle ${vehicle_no}`, transporter, lr_no && `LR ${lr_no}`, driver && `Driver ${driver}`].filter(Boolean).join(' · ')
  await logEvent(o.id, me, 'DO generated & dispatched', `${doNo} · ${plural(lines.length, 'line')} · ${truckDesc || 'No truck details'}`)

  revalidatePath('/', 'layout')
  redirect(`/orders?view=${o.id}&open_batch_pi=${batchId}&ok=${encodeURIComponent(`Delivery Order ${doNo} generated & dispatched.`)}`)
}

// Generate Proforma Invoice for a specific batch.
export async function generateBatchPI(fd) {
  const me = await requireRole()
  const orderId = fd.get('id')
  const batchId = fd.get('batch_id')
  const o = await getOrder(orderId, me)
  const path = back(fd, o.id)

  const { data: batch } = await db().from('order_batches').select('*, items:batch_items(*, order_item:order_items(*))').eq('id', batchId).maybeSingle()
  if (!batch) go(path, 'error', 'Batch not found.')
  if (batch.pi_date) go(path, 'error', 'Proforma Invoice already exists for this batch.')

  const note = String(fd.get('price_note') || '').trim()
  const biUpdates = []
  let priceChanged = false

  for (const bi of batch.items || []) {
    const rawQ = fd.get('qty_' + bi.id)
    const rawP = fd.get('price_' + bi.id)
    const q = num(rawQ)
    const p = num(rawP)
    if (isNaN(q) || q < 0 || isNaN(p) || p < 0) go(path, 'error', 'Quantities and prices must be 0 or more.')
    if (q > Number(bi.do_qty)) go(path, 'error', `Invoiced quantity cannot exceed the DO quantity (${bi.do_qty} PCS).`)

    const origPrice = Number(bi.order_item?.price || 0)
    if (q > 0 && Math.abs(p - origPrice) > 0.001) priceChanged = true
    const m2 = calcM2(bi.order_item?.width, bi.order_item?.length, q)
    const total = lineTotal(m2, q, p)
    biUpdates.push({
      id: bi.id,
      order_item_id: bi.order_item_id,
      invoiced_qty: q,
      invoiced_m2: m2,
      invoiced_price: p,
      invoiced_total: total,
    })
  }

  if (priceChanged && !note) go(path, 'error', 'Prices differ from the quotation — enter a reason.')

  let piNo = null
  const rpcRes = await db().rpc('generate_batch_pi', {
    p_batch: batchId,
    p_lines: biUpdates.map((u) => ({ order_item_id: u.order_item_id, qty: u.invoiced_qty, m2: u.invoiced_m2, price: u.invoiced_price, total: u.invoiced_total })),
    p_by: me.full_name,
    p_note: note || null,
  })

  if (!rpcRes.error && rpcRes.data) {
    piNo = rpcRes.data
  } else {
    const custCode = o.customer_code || 'CUS'
    const todayStr = new Date().toLocaleDateString('en-GB', { timeZone: 'Asia/Riyadh' }).replace(/\//g, '').replace(/^(\d{4})\d\d(\d\d)$/, '$1$2')
    const prefix = `${(await getSettings()).pi_prefix}-${custCode}-${todayStr}-`
    const { data: existing } = await db().from('order_batches').select('pi_no').ilike('pi_no', `${prefix}%`)
    const maxSeq = (existing || []).reduce((max, r) => {
      const n = parseInt(r.pi_no?.slice(prefix.length) || '0', 10)
      return n > max ? n : max
    }, 0)
    const seqStr = String(maxSeq + 1).padStart(2, '0')
    piNo = `${prefix}${seqStr}`

    await db().from('order_batches').update({
      pi_no: piNo,
      pi_date: today(),
      pi_by: me.full_name,
      price_note: note || null,
    }).eq('id', batchId)

    for (const u of biUpdates) {
      await db().from('batch_items').update({
        invoiced_qty: u.invoiced_qty,
        invoiced_m2: u.invoiced_m2,
        invoiced_price: u.invoiced_price,
        invoiced_total: u.invoiced_total,
      }).eq('id', u.id)
    }

    await db().from('orders').update({
      pi_date: o.pi_date || today(),
      pi_by: o.pi_by || me.full_name,
    }).eq('id', o.id)
  }

  await logEvent(o.id, me, 'PI generated', `${piNo}${priceChanged ? ` · price changed: ${note}` : ''}`)
  revalidatePath('/', 'layout')
  go(path, 'ok', `Proforma Invoice ${piNo} generated.`)
}

export const generateDO = generateBatchDO
export const generatePI = generateBatchPI

// Before any Delivery Order goes out an order can still be cancelled.
export async function cancelOrder(fd) {
  const me = await requireRole('approver')
  const id = fd.get('id')
  const reason = String(fd.get('reason') || '').trim()
  if (!reason) go(back(fd, id), 'error', 'Enter a reason for cancelling.')
  const { data } = await db().from('orders')
    .update({ status: 'CANCELLED', action_by: me.full_name, action_at: new Date().toISOString(), reject_reason: reason })
    .eq('id', id).in('status', ['PENDING', 'APPROVED']).is('do_date', null).select('quote_no')
  if (!data?.length) go(back(fd, id), 'error', 'Only orders without a Delivery Order can be cancelled.')
  await logEvent(id, me, 'Cancelled', reason)
  revalidatePath('/', 'layout')
  go(back(fd, id), 'ok', `Order ${data[0].quote_no} cancelled.`)
}

export async function uploadTaxInvoice(fd) {
  const me = await requireRole('accounts')
  const o = await getOrder(fd.get('id'), me)
  const path = back(fd, o.id)
  const file = fd.get('file')
  if (!file?.size) go(path, 'error', 'Choose a file first.')
  if (!/^(application\/pdf|image\/)/.test(file.type)) go(path, 'error', 'Only PDF or image files can be uploaded.')
  if (o.status !== 'APPROVED') go(path, 'error', 'Only approved orders can have a tax invoice.')

  // One tax invoice per DO/PI batch; the order keeps the latest one so the queues still work.
  const batch = (o.batches || []).find((b) => String(b.id) === String(fd.get('batch_id')))
  let key = null
  try {
    key = await saveInvoice(`${o.quote_no}${batch?.pi_no ? ` - ${batch.pi_no}` : ''} - ${file.name}`, file)
  } catch (e) { console.error('tax invoice upload:', e.message) }
  if (!key) go(path, 'error', 'Could not save the file to Google Drive. Try again; if it keeps failing, tell the admin.')
  const old = batch ? batch.tax_invoice_path : o.tax_invoice_path
  if (batch) await db().from('order_batches').update({ tax_invoice_path: key }).eq('id', batch.id)
  await db().from('orders').update({ tax_invoice_path: key }).eq('id', o.id)
  if (old) await removeInvoices([old]).catch((e) => console.error('old tax invoice cleanup:', e.message))
  await logEvent(o.id, me, old ? 'Tax invoice replaced' : 'Tax invoice uploaded', `${batch?.pi_no ? batch.pi_no + ': ' : ''}${file.name}`)
  revalidatePath('/', 'layout')
  go(path, 'ok', 'Tax invoice uploaded.')
}

// Takes back one dispatch entered by mistake.
export async function undoDispatch(fd) {
  const me = await requireRole('plant')
  const { data: d } = await db().from('dispatches').select('*, item:order_items(item_no)').eq('id', fd.get('dispatch_id') || 0).maybeSingle()
  const o = await getOrder(d?.order_id ?? fd.get('id'), me)
  const path = back(fd, o.id)
  if (!d) go(path, 'error', 'That dispatch was already undone.')
  if (o.status !== 'APPROVED') go(path, 'error', 'Only approved orders can change.')
  const { data: st, error } = await db().rpc('undo_dispatch', { p_dispatch: d.id })
  if (error) go(path, 'error', error.message)
  await logEvent(o.id, me, 'Dispatch undone', `Line ${d.item?.item_no}: ${d.qty} PCS of ${day(d.dispatch_date)}`)
  revalidatePath('/', 'layout')
  go(path, 'ok', `Dispatch undone - ${DISPATCH[st]?.[0] || 'Done'}.`)
}

// The rest of the DO will never ship: stop dispatching it (PI and tax invoice carry on as normal).
export async function shortClose(fd) {
  const me = await requireRole('plant', 'approver')
  const id = fd.get('id')
  const reason = String(fd.get('reason') || '').trim()
  if (!reason) go(back(fd, id), 'error', 'Enter a reason for the short close.')
  const { data } = await db().from('orders')
    .update({ dispatch_status: 'SHORT_CLOSED', short_close_reason: reason })
    .eq('id', id).eq('status', 'APPROVED').in('dispatch_status', ['PENDING', 'PARTIAL']).select('quote_no')
  if (!data?.length) go(back(fd, id), 'error', 'Only an order that is still being dispatched can be short closed.')
  await logEvent(id, me, 'Short closed', reason)
  revalidatePath('/', 'layout')
  go(back(fd, id), 'ok', `${data[0].quote_no} short closed.`)
}

export const recordDispatch = generateBatchDO

// Permanently delete an order and its associated records (items, batches, dispatches).
export async function deleteOrder(fd) {
  const me = await requireRole('admin')
  const id = fd.get('id')
  const { data: o } = await db().from('orders').select('id, quote_no, customer_name, salesperson_id, tax_invoice_path, batches:order_batches(tax_invoice_path)').eq('id', id).maybeSingle()
  if (!o) go('/orders', 'error', 'Order not found.')

  const { error } = await db().from('orders').delete().eq('id', id)
  if (error) go(`/orders?view=${id}`, 'error', error.message)
  await logEvent(null, me, 'Order deleted', `${o.quote_no} · ${o.customer_name}`)
  // Every batch's tax invoice, not only the latest one the order points at.
  try {
    await removeInvoices([...new Set([o.tax_invoice_path, ...(o.batches || []).map((b) => b.tax_invoice_path)])])
  } catch (e) { console.error('tax invoice cleanup:', e.message) }

  revalidatePath('/', 'layout')
  go('/orders', 'ok', `Order ${o.quote_no} has been permanently deleted.`)
}

// Admin correction of an order filled in wrongly: customer, salesperson, notes, transport and lines.
// Status, DOs and PIs stay as they are. A line on a Delivery Order can't be removed, and no line can
// go below what has already been dispatched. Every change goes into the order's timeline.
export async function updateOrder(_prev, fd) {
  const me = await requireRole('admin')
  const o = await findOrder(fd.get('order_id'), me)
  if (!o) return { error: 'Order not found.' }
  const { data: c } = await db().from('customers').select('*').eq('id', fd.get('customer_id') || 0).maybeSingle()
  if (!c) return { error: 'Please select a customer.' }
  const { data: sp } = await db().from('profiles').select('id, full_name').eq('id', fd.get('salesperson_id') || o.salesperson_id).maybeSingle()
  if (!sp) return { error: 'Please select a salesperson.' }
  const { items, error: lineError } = await parseLines(fd)
  if (lineError) return { error: lineError }

  const old = Object.fromEntries(o.items.map((it) => [String(it.id), it]))
  const { data: onDo } = await db().from('batch_items').select('order_item_id').in('order_item_id', o.items.map((it) => it.id))
  const locked = new Set((onDo || []).map((r) => String(r.order_item_id)))
  for (const it of items) {
    const was = it.line_id && old[it.line_id]
    if (it.line_id && !was) return { error: 'A line no longer belongs to this order. Reload the page and try again.' }
    if (was && it.qty < Number(was.dispatched_qty || 0)) return { error: `Line ${was.item_no}: ${int(was.dispatched_qty)} PCS are already dispatched, so Qty can't be lower.` }
  }
  const kept = new Set(items.map((it) => it.line_id).filter(Boolean))
  const removed = o.items.filter((it) => !kept.has(String(it.id)))
  for (const it of removed) {
    if (locked.has(String(it.id)) || Number(it.dispatched_qty) > 0) return { error: `Line ${it.item_no} is on a Delivery Order and can't be removed.` }
  }

  const transport = num(fd.get('transport')) > 0 ? num(fd.get('transport')) : 0
  const head = {
    ...(String(c.id) !== String(o.customer_id) && snapshot(c)),
    salesperson_id: sp.id,
    salesperson_name: sp.full_name,
    notes: String(fd.get('notes') || '').trim() || null,
    transport,
  }
  const changes = []
  if (head.customer_name) changes.push(`customer ${o.customer_name} → ${c.name}`)
  if (sp.id !== o.salesperson_id) changes.push(`salesperson ${o.salesperson_name} → ${sp.full_name}`)
  if ((head.notes || '') !== (o.notes || '')) changes.push('notes')
  if (Number(o.transport) !== transport) changes.push(`transport ${money(o.transport)} → ${money(transport)}`)

  const same = (a, b) => String(a ?? '') === String(b ?? '') || (a != null && b != null && Number(a) === Number(b))
  let next = Math.max(0, ...o.items.map((it) => it.item_no))
  const inserts = []
  for (const { line_id, item_no, ...it } of items) {
    const was = line_id && old[line_id]
    if (!was) {
      inserts.push({ ...it, order_id: o.id, item_no: ++next })
      changes.push(`line ${next} added`)
      continue
    }
    const diff = [...ATTRS, 'qty', 'price'].filter((k) => !same(it[k], was[k]))
    if (!diff.length) continue
    // Ready pieces can't be more than what is left to dispatch at the new quantity.
    const ready = Math.min(readyOf(was), Math.max(0, it.qty - Number(was.dispatched_qty || 0)))
    const { error } = await db().from('order_items').update({ ...it, ready_qty: ready }).eq('id', was.id)
    if (error) return { error: error.message }
    changes.push(`line ${was.item_no}: ${diff.map((k) => (k === 'qty' || k === 'price' ? `${k} ${was[k]} → ${it[k]}` : k.replace('_', ' '))).join(', ')}`)
  }
  if (removed.length) {
    const { error } = await db().from('order_items').delete().in('id', removed.map((it) => it.id))
    if (error) return { error: error.message }
    changes.push(...removed.map((it) => `line ${it.item_no} removed`))
  }
  if (inserts.length) {
    const { error } = await db().from('order_items').insert(inserts)
    if (error) return { error: error.message }
  }

  if (!changes.length) redirect(`/orders?view=${o.id}&ok=${encodeURIComponent('No changes to save.')}`)
  // Quantities changed after a DO: keep the order's dispatch status in step with its lines.
  if (o.dispatch_status && o.dispatch_status !== 'SHORT_CLOSED') {
    const { data: now } = await db().from('order_items').select('qty, dispatched_qty').eq('order_id', o.id)
    const done = now.every((it) => Number(it.dispatched_qty || 0) >= Number(it.qty))
    head.dispatch_status = done ? 'DISPATCHED' : now.some((it) => Number(it.dispatched_qty) > 0) ? 'PARTIAL' : 'PENDING'
  }
  const { error } = await db().from('orders').update(head).eq('id', o.id)
  if (error) return { error: error.message }

  const total = totals(items, transport, o.vat_rate).total
  await logEvent(o.id, me, 'Edited by admin', `${changes.join('; ')}${await creditNote(c, total, o.id)}`.slice(0, 1000))
  revalidatePath('/', 'layout')
  redirect(`/orders?view=${o.id}&ok=${encodeURIComponent(`${o.quote_no} updated.`)}`)
}
