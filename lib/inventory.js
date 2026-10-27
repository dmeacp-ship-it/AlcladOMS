import { cache } from 'react'
import { db } from './server'
import { today } from './tas'

// Inventory masters for the forms and lists (a few hundred rows at most). cache(): once per request.
// missing = migrate-015 has not been run yet.
export const invMasters = cache(async () => {
  const [plants, stores, materials, vendors] = await Promise.all([
    db().from('plants').select('code, name').order('code'),
    db().from('stores').select('id, plant_code, code, name, type').order('plant_code').order('name'),
    db().from('materials').select('id, code, name, category, uom, min_level').order('code').limit(10000),
    db().from('vendors').select('id, code, name').order('name').limit(10000),
  ])
  return {
    missing: !!plants.error,
    plants: plants.data || [], stores: stores.data || [], materials: materials.data || [], vendors: vendors.data || [],
  }
})

// Supabase error from an inventory call -> a sentence for the form.
export const invError = (e) => (/does not exist|Could not find the function/.test(e.message) ? 'Run migrate-015.sql in Supabase first.' : e.message)

export const storeLabel = (s) => (s ? `${s.name} (${s.plant_code})` : '')

// Stock report filters, shared by the page and its CSV: period (default this month), plant, store, text, below min.
const isDay = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || '')
export async function stockReport(sp) {
  const to = isDay(sp.to) ? sp.to : today()
  const from = isDay(sp.from) && sp.from <= to ? sp.from : `${to.slice(0, 8)}01`
  const p = { from, to, plant: sp.plant || '', store: /^\d+$/.test(sp.store || '') ? sp.store : '', q: String(sp.q || '').trim(), low: sp.low === '1' }
  const [{ data, error }, { stores }] = await Promise.all([
    db().rpc('stock_summary', { p_from: from, p_to: to, p_plant: p.plant || null, p_store: p.store ? Number(p.store) : null }),
    invMasters(),
  ])
  // Min level is a store rule: a production line (WIP) holding less than it is normal.
  const wip = new Set(stores.filter((s) => s.type === 'WIP').map((s) => s.id))
  const t = p.q.toLowerCase()
  const rows = (data || []).map((r) => ({ ...r, wip: wip.has(r.store_id) }))
    .filter((r) => (!t || `${r.code} ${r.name}`.toLowerCase().includes(t)) && (!p.low || isLow(r)))
  p.qs = new URLSearchParams(Object.entries({ ...p, low: p.low ? '1' : '' }).filter(([, v]) => v)).toString()
  return { rows, p, error }
}
export const isLow = (r) => !r.wip && r.min_level != null && Number(r.closing) < Number(r.min_level)
