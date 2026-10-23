// Data behind the Reports pages. Every page reads the same ?from=&to= period (default: this month).
import { QUEUES, db, fetchAll } from './server'
import { round2, today, totals } from './tas'

const isDay = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || '')
export const days = (a, b) => (new Date(String(b).slice(0, 10)) - new Date(String(a).slice(0, 10))) / 86400000
export const avg = (xs) => (xs.length ? round2(xs.reduce((s, x) => s + x, 0) / xs.length) : null)
export const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '—')

export function period(sp) {
  const to = isDay(sp.to) ? sp.to : today()
  const from = isDay(sp.from) ? sp.from : `${to.slice(0, 8)}01`
  return { from, to, qs: new URLSearchParams({ from, to }).toString() }
}

// Quotes in the period (by quote date), grouped by salesperson or customer. Value = approved orders, incl. VAT.
export async function sales({ from, to }) {
  const orders = await fetchAll(() => db().from('orders')
    .select('id, salesperson_name, customer_name, customer_code, status, transport, vat_rate, items:order_items(total)')
    .gte('quote_date', from).lte('quote_date', to))
  const value = (o) => totals(o.items, o.transport, o.vat_rate).total
  const group = (key) => Object.values(orders.reduce((m, o) => {
    const name = o[key] || '—'
    const g = (m[name] ??= { name, code: o.customer_code, quotes: 0, approved: 0, rejected: 0, pending: 0, cancelled: 0, quoted: 0, value: 0 })
    g.quotes++
    g.quoted += value(o)
    if (o.status === 'APPROVED') { g.approved++; g.value += value(o) }
    if (o.status === 'REJECTED') g.rejected++
    if (o.status === 'PENDING') g.pending++
    if (o.status === 'CANCELLED') g.cancelled++
    return m
  }, {})).sort((a, b) => b.value - a.value || b.quotes - a.quotes)
  const approved = orders.filter((o) => o.status === 'APPROVED')
  return {
    orders,
    bySales: group('salesperson_name'),
    byCustomer: group('customer_name'),
    approved: approved.length,
    decided: orders.filter((o) => ['APPROVED', 'REJECTED'].includes(o.status)).length,
    value: approved.reduce((s, o) => s + value(o), 0),
  }
}

// Waiting right now (not limited to the period), aged from when the previous step finished.
export async function waiting() {
  const now = today()
  const [pending, awaitDo, awaitPi, awaitTax] = await Promise.all([
    fetchAll(() => db().from('orders').select('id, quote_no, customer_name, salesperson_name, created_at').eq('status', 'PENDING')),
    fetchAll(() => QUEUES.AWAIT_DO(db().from('orders').select('id, quote_no, customer_name, salesperson_name, action_at'))),
    fetchAll(() => db().from('order_batches').select('id, do_no, do_date, order:orders!inner(id, quote_no, customer_name, salesperson_name, status)').is('pi_no', null).not('do_date', 'is', null).eq('order.status', 'APPROVED')),
    fetchAll(() => db().from('order_batches').select('id, pi_no, pi_date, order:orders!inner(id, quote_no, customer_name, salesperson_name, status)').not('pi_no', 'is', null).is('tax_invoice_path', null).eq('order.status', 'APPROVED')),
  ])
  return [
    { key: 'approval', label: 'Pending approval', who: 'Approver', icon: 'ph-hourglass', href: '/orders?status=PENDING', since: 'Submitted', rows: pending.map((o) => ({ ...o, since: o.created_at })) },
    { key: 'do', label: 'Awaiting DO', who: 'Plant / operations', icon: 'ph-truck', href: '/orders?status=AWAIT_DO', since: 'Approved', rows: awaitDo.map((o) => ({ ...o, since: o.action_at })) },
    { key: 'pi', label: 'Awaiting PI', who: 'Accounts', icon: 'ph-receipt', href: '/orders?status=AWAIT_PI', since: 'DO date', rows: awaitPi.map((b) => ({ ...b.order, since: b.do_date, ref: b.do_no })) },
    { key: 'tax', label: 'Awaiting tax invoice', who: 'Accounts', icon: 'ph-upload-simple', href: '/orders?status=AWAIT_TAX', since: 'PI date', rows: awaitTax.map((b) => ({ ...b.order, since: b.pi_date, ref: b.pi_no })) },
  ].map((q) => {
    const rows = q.rows.map((r) => ({ ...r, age: r.since ? Math.max(0, Math.floor(days(r.since, now))) : 0 })).sort((a, b) => b.age - a.age)
    return { ...q, rows, fresh: rows.filter((r) => r.age <= 2).length, week: rows.filter((r) => r.age > 2 && r.age <= 7).length, old: rows.filter((r) => r.age > 7).length }
  })
}

// Delivery Orders dated in the period, with lead times: approval -> first DO, DO -> PI.
export async function dispatch({ from, to }) {
  const batches = await fetchAll(() => db().from('order_batches')
    .select('id, batch_no, do_no, do_date, pi_no, pi_date, vehicle_no, transport, items:batch_items(do_qty, do_m2), order:orders(id, quote_no, customer_name, action_at)')
    .gte('do_date', from).lte('do_date', to).order('do_date', { ascending: false }).order('id', { ascending: false }))
  const rows = batches.map((b) => ({
    ...b,
    pcs: b.items.reduce((n, i) => n + Number(i.do_qty || 0), 0),
    m2: round2(b.items.reduce((n, i) => n + Number(i.do_m2 || 0), 0)),
    toDo: b.batch_no === 1 && b.order?.action_at ? Math.max(0, days(b.order.action_at, b.do_date)) : null,
    toPi: b.pi_date ? Math.max(0, days(b.do_date, b.pi_date)) : null,
  }))
  return {
    rows,
    pcs: rows.reduce((s, r) => s + r.pcs, 0),
    m2: round2(rows.reduce((s, r) => s + r.m2, 0)),
    toDo: avg(rows.filter((r) => r.toDo != null).map((r) => r.toDo)),
    toPi: avg(rows.filter((r) => r.toPi != null).map((r) => r.toPi)),
    noPi: rows.filter((r) => !r.pi_no).length,
  }
}
