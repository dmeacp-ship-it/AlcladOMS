import { cache } from 'react'
import { db, fetchAll } from './server'
import { today } from './tas'

export const SHIFTS = { DAY: 'Day', NIGHT: 'Night' }

// migrate-017 not run yet.
export const prodMissing = cache(async () => !!(await db().from('fg_items').select('id', { count: 'exact', head: true })).error)

// FG items (product + size) for pickers and labels, and FG position per item (migrate-017). cache(): once per request.
export const fgItems = cache(async () => fetchAll(() => db().from('fg_items')
  .select('id, code, brand, grade, color_code, color_name, core, skin, width, length, thickness, b_grade, m2_per_pc').order('code')).catch(() => []))
export const fgLabel = (f) => (f ? `${f.code}${f.color_name ? ` · ${f.color_name}` : ''}` : '')
// For LinesForm, which picks "materials": FG items counted in pieces.
export const fgAsMaterials = (list) => list.map((f) => ({ id: f.id, code: f.code, name: f.color_name || f.code, category: f.b_grade ? 'FG B-grade' : 'FG', uom: 'PCS' }))

// { [fg_item_id]: { stock, reserved, need, planned, in_qc, free, short } } — the orders' FG store (Company Settings).
// free = stock − reserved; short = what orders still need that no stock, plan or QC covers.
export const fgPosition = cache(async () => {
  const { data } = await db().rpc('fg_position')
  return Object.fromEntries((data || []).map((r) => {
    const n = Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Number(v) || 0]))
    const free = n.stock - n.reserved
    return [r.fg_item_id, { ...n, free, short: Math.max(0, n.need - Math.max(0, free) - n.planned - n.in_qc) }]
  }))
})

// FG stock report filters (page + CSV): period (default this month) and store.
const isDay = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || '')
export async function fgReport(sp) {
  const to = isDay(sp.to) ? sp.to : today()
  const from = isDay(sp.from) && sp.from <= to ? sp.from : `${to.slice(0, 8)}01`
  const p = { from, to, store: /^\d+$/.test(sp.store || '') ? sp.store : '', q: String(sp.q || '').trim() }
  const { data, error } = await db().rpc('fg_stock_summary', { p_from: from, p_to: to, p_store: p.store ? Number(p.store) : null })
  const t = p.q.toLowerCase()
  const rows = (data || []).filter((r) => !t || `${r.code} ${r.color_name || ''}`.toLowerCase().includes(t))
  p.qs = new URLSearchParams(Object.entries(p).filter(([, v]) => v)).toString()
  return { rows, p, error }
}
