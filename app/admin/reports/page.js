import Link from 'next/link'
import { QUEUES, db, fetchAll, requireRole } from '@/lib/server'
import { dmy, int, money, round2, today, totals } from '@/lib/tas'

export const metadata = { title: 'Reports' }

const isDay = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || '')
const days = (a, b) => (new Date(String(b).slice(0, 10)) - new Date(String(a).slice(0, 10))) / 86400000
const avg = (xs) => (xs.length ? round2(xs.reduce((s, x) => s + x, 0) / xs.length) : null)
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '—')

// Sales by salesperson and customer, what is waiting and for how long, and dispatch lead times.
export default async function Reports({ searchParams }) {
  await requireRole('admin')
  const sp = await searchParams
  const to = isDay(sp.to) ? sp.to : today()
  const from = isDay(sp.from) ? sp.from : `${to.slice(0, 8)}01`
  const now = today()

  const [orders, pending, awaitDo, awaitPi, awaitTax, firstDos, pis] = await Promise.all([
    fetchAll(() => db().from('orders').select('id, salesperson_name, customer_name, status, transport, vat_rate, items:order_items(total)').gte('quote_date', from).lte('quote_date', to)),
    fetchAll(() => db().from('orders').select('id, quote_no, customer_name, created_at').eq('status', 'PENDING')),
    fetchAll(() => QUEUES.AWAIT_DO(db().from('orders').select('id, quote_no, customer_name, action_at'))),
    fetchAll(() => db().from('order_batches').select('id, do_no, do_date, order:orders!inner(id, quote_no, customer_name, status)').is('pi_no', null).not('do_date', 'is', null).eq('order.status', 'APPROVED')),
    fetchAll(() => db().from('order_batches').select('id, pi_no, pi_date, order:orders!inner(id, quote_no, customer_name, status)').not('pi_no', 'is', null).is('tax_invoice_path', null).eq('order.status', 'APPROVED')),
    fetchAll(() => db().from('order_batches').select('do_date, order:orders(action_at)').eq('batch_no', 1).gte('do_date', from).lte('do_date', to)),
    fetchAll(() => db().from('order_batches').select('do_date, pi_date, items:batch_items(do_qty)').gte('do_date', from).lte('do_date', to)),
  ])

  // Sales in the period, by quote date. Value = approved orders, incl. VAT.
  const value = (o) => totals(o.items, o.transport, o.vat_rate).total
  const group = (key) => Object.values(orders.reduce((m, o) => {
    const g = (m[o[key] || '—'] ??= { name: o[key] || '—', quotes: 0, approved: 0, rejected: 0, value: 0 })
    g.quotes++
    if (o.status === 'APPROVED') { g.approved++; g.value += value(o) }
    if (o.status === 'REJECTED') g.rejected++
    return m
  }, {})).sort((a, b) => b.value - a.value)
  const bySales = group('salesperson_name')
  const byCustomer = group('customer_name').slice(0, 10)
  const approved = orders.filter((o) => o.status === 'APPROVED')
  const decided = orders.filter((o) => ['APPROVED', 'REJECTED'].includes(o.status)).length
  const totalValue = approved.reduce((s, o) => s + value(o), 0)
  const topValue = Math.max(1, ...bySales.map((g) => g.value), ...byCustomer.map((g) => g.value))

  // Waiting right now, aged from when the previous step finished.
  const queues = [
    { label: 'Pending approval', icon: 'ph-hourglass', href: '/orders?status=PENDING', rows: pending.map((o) => ({ ...o, since: o.created_at })) },
    { label: 'Awaiting DO', icon: 'ph-truck', href: '/orders?status=AWAIT_DO', rows: awaitDo.map((o) => ({ ...o, since: o.action_at })) },
    { label: 'Awaiting PI', icon: 'ph-receipt', href: '/orders?status=AWAIT_PI', rows: awaitPi.map((b) => ({ ...b.order, since: b.do_date, ref: b.do_no })) },
    { label: 'Awaiting tax invoice', icon: 'ph-upload-simple', href: '/orders?status=AWAIT_TAX', rows: awaitTax.map((b) => ({ ...b.order, since: b.pi_date, ref: b.pi_no })) },
  ].map((q) => {
    const ages = q.rows.map((r) => ({ ...r, age: r.since ? days(r.since, now) : 0 })).sort((a, b) => b.age - a.age)
    return { ...q, ages, fresh: ages.filter((r) => r.age <= 2).length, week: ages.filter((r) => r.age > 2 && r.age <= 7).length, old: ages.filter((r) => r.age > 7).length }
  })

  // Dispatch in the period, by DO date.
  const toDo = firstDos.filter((b) => b.order?.action_at).map((b) => Math.max(0, days(b.order.action_at, b.do_date)))
  const toPi = pis.filter((b) => b.pi_date).map((b) => Math.max(0, days(b.do_date, b.pi_date)))
  const pcs = pis.reduce((s, b) => s + b.items.reduce((n, i) => n + Number(i.do_qty || 0), 0), 0)

  const range = new URLSearchParams({ from, to })
  const bar = (v) => <div style={{ height: 6, borderRadius: 3, background: 'var(--accent)', width: `${Math.max(2, (v / topValue) * 100)}%`, marginTop: 4 }} />
  const salesTable = (title, icon, rows) => (
    <div className="card">
      <div className="tbl-top"><div className="tbl-ttl"><i className={`ph ${icon}`} />{title}</div></div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>Name</th><th className="r">Quotes</th><th className="r">Approved</th><th className="r">Rejected</th><th className="r">Win rate</th><th style={{ minWidth: 200 }}>Approved value (SAR)</th></tr></thead>
          <tbody>
            {rows.map((g) => (
              <tr key={g.name}>
                <td className="fw6"><bdi>{g.name}</bdi></td>
                <td className="num">{g.quotes}</td><td className="num">{g.approved}</td><td className="num">{g.rejected}</td>
                <td className="num">{pct(g.approved, g.approved + g.rejected)}</td>
                <td className="num fw6">{money(g.value)}{bar(g.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <div className="empty"><i className="ph ph-chart-bar" /><h3>No quotes in this period</h3><p>Pick a wider date range.</p></div>}
      </div>
    </div>
  )

  return (
    <>
      <div className="page-head">
        <form className="row">
          <label htmlFor="from" className="sub">From</label>
          <input id="from" type="date" name="from" defaultValue={from} style={{ width: 160 }} />
          <label htmlFor="to" className="sub">to</label>
          <input id="to" type="date" name="to" defaultValue={to} style={{ width: 160 }} />
          <button className="btn btn-ghost btn-sm"><i className="ph ph-arrow-clockwise" />Update</button>
        </form>
        <div className="acts">
          <span className="muted text-sm">Download for this period:</span>
          {[['orders', 'Orders'], ['lines', 'Order lines'], ['dispatches', 'Dispatches'], ['invoices', 'Invoices']].map(([k, l]) => (
            <a key={k} className="btn btn-ghost btn-sm" href={`/admin/export/${k}?${range}`}><i className="ph ph-download-simple" />{l}</a>
          ))}
        </div>
      </div>

      <div className="stats">
        {[
          ['ph-file-text', 'ca', orders.length, 'Quotes'],
          ['ph-seal-check', 'cg', approved.length, 'Approved'],
          ['ph-percent', 'co', pct(approved.length, decided), 'Win rate'],
          ['ph-currency-circle-dollar', 'cg', money(totalValue), 'Approved SAR'],
          ['ph-truck', 'ca', avg(toDo) ?? '—', 'Days to first DO'],
          ['ph-receipt', 'co', avg(toPi) ?? '—', 'Days DO → PI'],
          ['ph-package', 'ct', int(pcs), 'PCS on DOs'],
        ].map(([ic, cls, n, l]) => (
          <div key={l} className="stat"><i className={`ph ${ic} stat-ic ${cls}`} /><div className={`stat-n ${cls}`}>{n}</div><div className="stat-l">{l}</div></div>
        ))}
      </div>

      {salesTable('By salesperson', 'ph-user', bySales)}
      {salesTable('Top 10 customers', 'ph-storefront', byCustomer)}

      <div className="card">
        <div className="tbl-top"><div className="tbl-ttl"><i className="ph ph-clock" />Waiting now <span className="hint">— days since the previous step finished</span></div></div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Queue</th><th className="r">Total</th><th className="r">0–2 days</th><th className="r">3–7 days</th><th className="r">Over 7 days</th><th>Oldest</th></tr></thead>
            <tbody>
              {queues.map((q) => (
                <tr key={q.label}>
                  <td className="fw6 nowrap"><Link href={q.href}><i className={`ph ${q.icon}`} /> {q.label}</Link></td>
                  <td className="num fw6">{q.ages.length}</td>
                  <td className="num">{q.fresh}</td>
                  <td className="num">{q.week}</td>
                  <td className={`num${q.old ? ' red fw6' : ''}`}>{q.old}</td>
                  <td className="nowrap">
                    {q.ages[0]
                      ? <><Link className="qno" href={`/orders?view=${q.ages[0].id}`}>{q.ages[0].quote_no}</Link> <span className="muted">· {Math.floor(q.ages[0].age)} days · {dmy(String(q.ages[0].since).slice(0, 10))}{q.ages[0].ref ? ` · ${q.ages[0].ref}` : ''}</span></>
                      : <span className="muted">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
