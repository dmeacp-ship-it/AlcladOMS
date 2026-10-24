import { cache } from 'react'
import { cookies, headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { can } from './tas'

// Session-aware client: only for sign-in, sign-out and "who is logged in".
export async function authClient() {
  const store = await cookies()
  return createServerClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      // Throws inside Server Components (read-only cookies); proxy.js keeps the session fresh.
      setAll: (list) => { try { list.forEach(({ name, value, options }) => store.set(name, value, options)) } catch {} },
    },
  })
}

// Service-role client for all data. Tables have RLS with no policies, so this
// server is the only way in and role checks live in requireRole().
let admin
export const db = () =>
  (admin ??= createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  }))

// Signed-in user id, as verified by proxy.js for this request (one Supabase Auth call per request, not two).
// Falls back to asking Supabase if the header is missing, e.g. a route the proxy matcher skips.
export const sessionUserId = cache(async () => {
  const id = (await headers()).get('x-tas-user')
  if (id) return id
  const { data: { user } } = await (await authClient()).auth.getUser()
  return user?.id || null
})

export const currentUser = cache(async () => {
  const id = await sessionUserId()
  if (!id) return null
  const { data } = await db().from('profiles').select('*').eq('id', id).maybeSingle()
  return data?.active ? data : null
})

// No roles = any signed-in user.
export async function requireRole(...roles) {
  const me = await currentUser()
  if (!me) redirect('/login')
  if (roles.length && !can(me, ...roles)) go('/orders', 'error', 'You are not allowed to do that.')
  return me
}

// Redirect with a flash message (?error= or ?ok=), shown as a toast by the Shell.
export function go(path, kind, msg) {
  redirect(`${path}${path.includes('?') ? '&' : '?'}${kind}=${encodeURIComponent(msg)}`)
}

// Work queues (orders list ?status= values beyond the plain statuses).
// Flow: approval -> DO -> plant dispatch (alongside PI -> tax invoice).
export const QUEUES = {
  // Still moving: waiting for approval, or approved but DO / dispatch / PI / tax invoice not all done.
  ACTIVE: (q) => q.in('status', ['PENDING', 'APPROVED'])
    .or('pi_date.is.null,do_date.is.null,tax_invoice_path.is.null,dispatch_status.in.(PENDING,PARTIAL)'),
  AWAIT_DO: (q) => q.eq('status', 'APPROVED').is('do_date', null),
  AWAIT_DISPATCH: (q) => q.eq('status', 'APPROVED').in('dispatch_status', ['PENDING', 'PARTIAL']),
  AWAIT_PI: (q) => q.eq('status', 'APPROVED').not('do_date', 'is', null).is('pi_date', null),
  AWAIT_TAX: (q) => q.eq('status', 'APPROVED').not('pi_date', 'is', null).is('tax_invoice_path', null),
}
// Order counts by status and work queue ('ALL', 'PENDING', 'ACTIVE', 'AWAIT_DO', …), optionally for one
// salesperson. One query via order_counts() (migrate-009, same filters as QUEUES); before that runs,
// one count per key. cache(): the sidebar badges and the Orders tiles share it per request.
const COUNT_KEYS = ['ALL', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'ACTIVE', 'AWAIT_DO', 'AWAIT_DISPATCH', 'AWAIT_PI', 'AWAIT_TAX']
export const orderCounts = cache(async (salesperson = null) => {
  const { data, error } = await db().rpc('order_counts', { p_salesperson: salesperson })
  if (!error && data) return data
  const n = await Promise.all(COUNT_KEYS.map(async (k) => {
    let q = db().from('orders').select('id', { count: 'exact', head: true })
    if (salesperson) q = q.eq('salesperson_id', salesperson)
    return (await filterOrders(q, k === 'ALL' ? '' : k)).count || 0
  }))
  return Object.fromEntries(COUNT_KEYS.map((k, i) => [k, n[i]]))
})

// Every row of a query: Supabase returns at most 1000 per request, so read in pages.
// make() builds a fresh query each time (a query can only run once).
export async function fetchAll(make) {
  const out = []
  for (let i = 0; ; i += 1000) {
    const { data, error } = await make().range(i, i + 999)
    if (error) throw error
    out.push(...data)
    if (data.length < 1000) return out
  }
}

export const filterOrders = (q, status) => (QUEUES[status] ? QUEUES[status](q) : status ? q.eq('status', status) : q)

// Order with its lines, or null; sales users only ever see their own orders.
// cache(): a page and its generateMetadata (tab title) share one fetch per request.
export const findOrder = cache(async (id, me) => {
  if (!/^\d+$/.test(String(id))) return null
  // Order, lines and DO/PI batches (with their lines) in one round trip.
  const { data: o } = await db().from('orders')
    .select('*, items:order_items(*), batches:order_batches(*, items:batch_items(*, order_item:order_items(*)))')
    .eq('id', id).maybeSingle()
  if (!o || (me.role === 'sales' && o.salesperson_id !== me.id)) return null
  o.items.sort((a, b) => a.item_no - b.item_no)
  o.batches = (o.batches || []).sort((a, b) => a.batch_no - b.batch_no)
  return o
})
export const getOrder = async (id, me) => (await findOrder(id, me)) ?? notFound()

// Dispatches and timeline of one order, for its profile dialog (call only after findOrder allowed it).
export async function orderHistory(id) {
  const [{ data: dispatches }, { data: events }] = await Promise.all([
    db().from('dispatches').select('*').eq('order_id', id).order('id', { ascending: false }),
    db().from('order_events').select('*').eq('order_id', id).order('id', { ascending: false }),
  ])
  return { dispatches: dispatches || [], events: events || [] }
}

// Timeline / activity-log entry; orderId null for actions that aren't about one order (settings, users, imports).
// Supabase returns errors instead of throwing, so a failed log never blocks the action.
export const logEvent = (orderId, me, action, detail = null) =>
  db().from('order_events').insert({ order_id: orderId, by_name: me.full_name, action, detail })
