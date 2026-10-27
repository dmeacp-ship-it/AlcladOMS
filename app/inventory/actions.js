'use server'
import { redirect } from 'next/navigation'
import { db, go, logEvent, requireRole } from '@/lib/server'
import { invError, invMasters } from '@/lib/inventory'
import { parseCSV } from '@/lib/csv'
import { plural, qty as fmt, today } from '@/lib/tas'

// Inventory phase 1: admin and manager do everything; only admin approves or rejects a PO.
// Form actions (useActionState) return { error } so the typed lines stay; the rest redirect with a toast.
const str = (fd, k) => String(fd.get(k) || '').trim()
const num = (v) => (String(v ?? '').trim() === '' ? NaN : Number(v))
const dateOf = (fd) => {
  const d = str(fd, 'date') || today()
  return /^\d{4}-\d{2}-\d{2}$/.test(d) && d <= today() ? d : null
}
const done = (path, msg) => redirect(`${path}${path.includes('?') ? '&' : '?'}ok=${encodeURIComponent(msg)}`)

// LinesForm rows -> [{ material, qty, rate }] or { error }. signed: adjustments, any non-zero quantity.
function readLines(fd, { signed = false } = {}) {
  const mats = fd.getAll('material')
  const qtys = fd.getAll('qty')
  const rates = fd.getAll('rate')
  const out = []
  for (let i = 0; i < mats.length; i++) {
    const q = num(qtys[i])
    const r = rates.length ? num(rates[i] || 0) : 0
    if (!mats[i]) return { error: `Line ${i + 1}: pick a material.` }
    if (!(signed ? q && Number.isFinite(q) : q > 0)) return { error: `Line ${i + 1}: enter a quantity${signed ? ' other than 0' : ' above 0'}.` }
    if (!(r >= 0)) return { error: `Line ${i + 1}: the rate must be 0 or more.` }
    out.push({ material: Number(mats[i]), qty: q, rate: r })
  }
  return out.length ? out : { error: 'Add at least one material line.' }
}

// ── Purchase orders ──
export async function createPO(_prev, fd) {
  const me = await requireRole('manager')
  const date = dateOf(fd)
  if (!date) return { error: 'Pick a PO date, not in the future.' }
  if (!str(fd, 'plant')) return { error: 'Pick the plant the material is for.' }
  const lines = readLines(fd)
  if (lines.error) return lines
  const { data: no, error } = await db().rpc('create_po', {
    p_head: { date, plant: str(fd, 'plant'), vendor: str(fd, 'vendor'), notes: str(fd, 'notes'), by: me.full_name },
    p_lines: lines,
  })
  if (error) return { error: invError(error) }
  const { data: po } = await db().from('purchase_orders').select('id, vendor_name').eq('po_no', no).single()
  await logEvent(null, me, 'PO created', `${no} · ${po.vendor_name} · ${plural(lines.length, 'line')}`)
  done(`/inventory/po/${po.id}`, `${no} created. An admin approves it before goods can be received.`)
}

// Approve / reject (admin) and close (admin or manager): only from the status each one expects.
async function setPOStatus(fd, me, from, patch, action) {
  const id = str(fd, 'id')
  const path = `/inventory/po/${id}`
  const { data, error } = await db().from('purchase_orders')
    .update({ ...patch, action_by: me.full_name, action_at: new Date().toISOString() })
    .eq('id', id).eq('status', from).select('po_no')
  if (error) go(path, 'error', invError(error))
  if (!data?.length) go(path, 'error', 'This PO changed meanwhile: check its status and try again.')
  await logEvent(null, me, action, `${data[0].po_no}${patch.reason ? ` · ${patch.reason}` : ''}`)
  done(path, `${data[0].po_no}: ${action.replace('PO ', '').toLowerCase()}.`)
}

export async function approvePO(fd) {
  const me = await requireRole('admin')
  await setPOStatus(fd, me, 'PENDING', { status: 'APPROVED' }, 'PO approved')
}

export async function rejectPO(fd) {
  const me = await requireRole('admin')
  const reason = str(fd, 'reason')
  if (!reason) go(`/inventory/po/${str(fd, 'id')}`, 'error', 'Give a reason for rejecting it.')
  await setPOStatus(fd, me, 'PENDING', { status: 'REJECTED', reason }, 'PO rejected')
}

export async function closePO(fd) {
  const me = await requireRole('manager')
  const reason = str(fd, 'reason')
  if (!reason) go(`/inventory/po/${str(fd, 'id')}`, 'error', 'Give a reason for closing it before everything arrived.')
  await setPOStatus(fd, me, 'APPROVED', { status: 'CLOSED', reason }, 'PO closed')
}

// ── GRN and incoming QC ──
export async function createGRN(_prev, fd) {
  const me = await requireRole('manager')
  const date = dateOf(fd)
  if (!date) return { error: 'Pick the date the goods arrived, not in the future.' }
  const lines = fd.getAll('po_item').map((id) => ({ po_item: Number(id), qty: num(fd.get(`qty_${id}`)) }))
    .filter((l) => !Number.isNaN(l.qty) && l.qty !== 0)
  if (lines.some((l) => !(l.qty > 0))) return { error: 'Received quantities must be above 0.' }
  if (!lines.length) return { error: 'Enter the received quantity on at least one line.' }
  const { data: no, error } = await db().rpc('create_grn', {
    p_head: { po: str(fd, 'po'), store: str(fd, 'store'), date, invoice_no: str(fd, 'invoice_no'), notes: str(fd, 'notes'), by: me.full_name },
    p_lines: lines,
  })
  if (error) return { error: invError(error) }
  const { data: g } = await db().from('grns').select('id, po:purchase_orders(po_no)').eq('grn_no', no).single()
  await logEvent(null, me, 'GRN created', `${no} · ${g.po.po_no} · ${plural(lines.length, 'line')}`)
  done(`/inventory/grn/${g.id}`, `${no} saved. Enter the QC result to put the accepted quantity into stock.`)
}

export async function qcGRN(_prev, fd) {
  const me = await requireRole('manager')
  const id = str(fd, 'id')
  const path = `/inventory/grn/${id}`
  const lines = fd.getAll('item').map((i) => ({ id: Number(i), rejected: num(fd.get(`rej_${i}`) || 0), remarks: str(fd, `rem_${i}`) }))
  if (lines.some((l) => !(l.rejected >= 0))) return { error: 'Rejected quantities must be 0 or more.' }
  if (lines.some((l) => l.rejected > 0 && !l.remarks)) return { error: 'Say why on every line with a rejected quantity.' }
  const { data: no, error } = await db().rpc('qc_grn', { p_grn: Number(id), p_lines: lines, p_by: me.full_name })
  if (error) return { error: invError(error) }
  const rej = lines.filter((l) => l.rejected > 0)
  await logEvent(null, me, 'GRN QC done', `${no}${rej.length ? ` · ${plural(rej.length, 'line')} with rejections` : ' · all accepted'}`)
  done(path, `${no}: QC saved, accepted quantity is in stock.`)
}

// ── Issue / transfer between stores ──
export async function createTransfer(_prev, fd) {
  const me = await requireRole('manager')
  const date = dateOf(fd)
  if (!date) return { error: 'Pick the issue date, not in the future.' }
  const [from, to] = [str(fd, 'from'), str(fd, 'to')]
  if (!from || !to) return { error: 'Pick the store it comes from and the store or line it goes to.' }
  if (from === to) return { error: 'From and To must be different stores.' }
  const lines = readLines(fd)
  if (lines.error) return lines
  const { data: no, error } = await db().rpc('create_transfer', {
    p_head: { from, to, date, requested_by: str(fd, 'requested_by'), notes: str(fd, 'notes'), by: me.full_name },
    p_lines: lines.map(({ material, qty }) => ({ material, qty })),
  })
  if (error) return { error: invError(error) }
  const { data: t } = await db().from('transfers').select('id').eq('doc_no', no).single()
  await logEvent(null, me, 'Material issued', `${no} · ${plural(lines.length, 'line')}`)
  done(`/inventory/issue/${t.id}`, `${no} saved.`)
}

// ── Opening stock and adjustments ──
export async function postAdjustment(_prev, fd) {
  const me = await requireRole('manager')
  const date = dateOf(fd)
  if (!date) return { error: 'Pick the date, not in the future.' }
  const store = Number(str(fd, 'store'))
  const reason = str(fd, 'reason')
  if (!store) return { error: 'Pick the store.' }
  if (!reason) return { error: 'Give the reason (e.g. stock count difference, damaged).' }
  const lines = readLines(fd, { signed: true })
  if (lines.error) return lines
  const { data: no, error } = await db().rpc('post_adjustment', {
    p_type: 'ADJUST', p_date: date, p_by: me.full_name,
    p_lines: lines.map(({ material, qty }) => ({ store, material, qty, note: reason })),
  })
  if (error) return { error: invError(error) }
  await logEvent(null, me, 'Stock adjusted', `${no} · ${plural(lines.length, 'line')} · ${reason}`)
  done('/inventory/adjust', `${no} posted.`)
}

// Go-live stock from Excel (CSV): store_code, material_code, qty. Refused for any store + material that
// already has stock entries, so it can't be loaded twice.
export async function importOpening(fd) {
  const me = await requireRole('manager')
  const P = '/inventory/adjust'
  const date = dateOf(fd)
  if (!date) go(P, 'error', 'Pick the opening date, not in the future.')
  const file = fd.get('file')
  if (!file?.size) go(P, 'error', 'Choose a CSV file first.')
  const rows = parseCSV(await file.text())
  if (!rows.length) go(P, 'error', 'That file has no rows under the header.')
  if (!['store_code', 'material_code', 'qty'].every((h) => h in rows[0])) go(P, 'error', 'The header row must be: store_code, material_code, qty.')
  const { stores, materials } = await invMasters()
  const store = Object.fromEntries(stores.map((s) => [s.code.toUpperCase(), s.id]))
  const mat = Object.fromEntries(materials.map((m) => [m.code.toUpperCase(), m.id]))
  const seen = new Set()
  const lines = []
  for (const [i, r] of rows.entries()) {
    const s = store[r.store_code.toUpperCase()]
    const m = mat[r.material_code.toUpperCase()]
    const q = num(r.qty.replace(/,/g, ''))
    if (!s) go(P, 'error', `Row ${i + 2}: no store with code "${r.store_code}".`)
    if (!m) go(P, 'error', `Row ${i + 2}: no material with code "${r.material_code}".`)
    if (!(q > 0)) go(P, 'error', `Row ${i + 2}: qty "${r.qty}" must be above 0.`)
    if (seen.has(`${s}-${m}`)) go(P, 'error', `Row ${i + 2}: ${r.material_code} in ${r.store_code} appears twice.`)
    seen.add(`${s}-${m}`)
    lines.push({ store: s, material: m, qty: q, note: file.name })
  }
  const { data: no, error } = await db().rpc('post_adjustment', { p_type: 'OPENING', p_date: date, p_lines: lines, p_by: me.full_name })
  if (error) go(P, 'error', invError(error))
  const total = lines.reduce((n, l) => n + l.qty, 0)
  await logEvent(null, me, 'Opening stock loaded', `${no} · ${plural(lines.length, 'line')} · ${fmt(total)} total · ${file.name}`)
  done(P, `${no}: opening stock loaded for ${plural(lines.length, 'line')}.`)
}
