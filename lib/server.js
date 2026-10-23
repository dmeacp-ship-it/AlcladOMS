import { cache } from 'react'
import { cookies } from 'next/headers'
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

export const currentUser = cache(async () => {
  const { data: { user } } = await (await authClient()).auth.getUser()
  if (!user) return null
  const { data } = await db().from('profiles').select('*').eq('id', user.id).maybeSingle()
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

export const filterOrders =(q, status) => (QUEUES[status] ? QUEUES[status](q) : status ? q.eq('status', status) : q)

// Order with its lines, or null; sales users only ever see their own orders.
// cache(): a page and its generateMetadata (tab title) share one fetch per request.
export const findOrder = cache(async (id, me) => {
  if (!/^\d+$/.test(String(id))) return null
  const { data: o } = await db().from('orders').select('*, items:order_items(*)').eq('id', id).maybeSingle()
  if (!o || (me.role === 'sales' && o.salesperson_id !== me.id)) return null
  o.items.sort((a, b) => a.item_no - b.item_no)
  try {
    const { data: batches } = await db()
      .from('order_batches')
      .select('*, items:batch_items(*, order_item:order_items(*))')
      .eq('order_id', id)
      .order('batch_no', { ascending: true })
    o.batches = batches || []
  } catch {
    o.batches = []
  }
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
