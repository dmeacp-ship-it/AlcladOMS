import { cache } from 'react'
import { db } from './server'
import { fgPosition } from './production'

// Waiting work on the store and production side (sidebar badges and the To Do page). cache(): once per request.
// Zeros before migrate-015 / 017 run.
const count = async (q) => (await q).count || 0
export const invTodo = cache(async () => {
  const [po, grn, qc, pos] = await Promise.all([
    count(db().from('purchase_orders').select('id', { count: 'exact', head: true }).eq('status', 'PENDING')),
    count(db().from('grns').select('id', { count: 'exact', head: true }).eq('status', 'QC_PENDING')),
    count(db().from('production_items').select('id', { count: 'exact', head: true }).is('qc_at', null).gt('good_qty', 0)),
    fgPosition(),
  ])
  const short = Object.values(pos).filter((p) => p.short > 0)
  return { po, grn, qc, toPlan: short.length, toPlanPcs: short.reduce((n, p) => n + p.short, 0) }
})
