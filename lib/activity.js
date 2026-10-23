import { db } from './server'

// Activity log filters, shared by the page and its CSV export: user, action, date range (Riyadh days), text.
export function activityQuery(sp, { count = false } = {}) {
  let q = db().from('order_events')
    .select('id, at, by_name, action, detail, order_id, order:orders(quote_no)', count ? { count: 'exact' } : undefined)
    .order('at', { ascending: false })
  if (sp.user) q = q.eq('by_name', sp.user)
  if (sp.action) q = q.eq('action', sp.action)
  if (/^\d{4}-\d{2}-\d{2}$/.test(sp.from || '')) q = q.gte('at', `${sp.from}T00:00:00+03:00`)
  if (/^\d{4}-\d{2}-\d{2}$/.test(sp.to || '')) q = q.lte('at', `${sp.to}T23:59:59.999+03:00`)
  const t = String(sp.q || '').replace(/[,()*%]/g, '').trim()
  if (t) q = q.or(`detail.ilike.%${t}%,action.ilike.%${t}%,by_name.ilike.%${t}%`)
  return q
}

export const stamp = (t) => new Date(t).toLocaleString('en-GB', { timeZone: 'Asia/Riyadh', dateStyle: 'medium', timeStyle: 'short' })
