import Link from 'next/link'
import { openLineCount, orderCounts, requireRole } from '@/lib/server'
import { stockReport } from '@/lib/inventory'
import { invTodo } from '@/lib/todo'
import { can, qty } from '@/lib/tas'
import { LinkBusy } from '../ui'

export const metadata = { title: 'To Do Today' }

// Start page: one big box per kind of waiting work this user's job does, with the count; a box opens the page
// where that work is done. Boxes with nothing waiting are greyed, so the ones to do now stand out.
export default async function Today() {
  const me = await requireRole()
  const boss = ['admin', 'manager'].includes(me.role)
  const [c, inv, low] = await Promise.all([
    orderCounts(null),
    boss ? invTodo() : null,
    boss ? stockReport({ low: '1' }).then((r) => r.rows.length) : 0,
  ])
  const lines = can(me, 'plant') ? c.LINES ?? await openLineCount() : 0
  const groups = [
    ['Sales', [
      can(me, 'approver') && ['ph-seal-check', c.PENDING, 'quotations to approve', '/orders?status=PENDING'],
      can(me, 'operations') && ['ph-file-text', c.AWAIT_DO, 'orders waiting for a Delivery Order', '/orders?status=AWAIT_DO'],
      can(me, 'plant') && ['ph-truck', lines, 'order lines to dispatch', '/plant'],
      can(me, 'accounts') && ['ph-receipt', c.AWAIT_PI, 'proforma invoices to make', '/orders?status=AWAIT_PI'],
      can(me, 'accounts') && ['ph-upload-simple', c.AWAIT_TAX, 'tax invoices to upload', '/orders?status=AWAIT_TAX'],
    ]],
    boss && ['Store', [
      me.role === 'admin' && ['ph-shopping-cart', inv.po, 'purchase orders to approve', '/inventory/po?show=PENDING'],
      ['ph-package', inv.grn, 'deliveries to check', '/inventory/grn'],
      ['ph-warning', low, 'materials below minimum', '/inventory?low=1'],
    ]],
    boss && ['Production', [
      ['ph-calendar-check', inv.toPlanPcs, `pieces still to make${inv.toPlan ? ` (${inv.toPlan} items)` : ''}`, '/production'],
      ['ph-seal-check', inv.qc, 'production rows to check', '/production/qc'],
    ]],
  ].filter(Boolean).map(([t, list]) => [t, list.filter(Boolean)]).filter(([, list]) => list.length)
  const shortcuts = [
    can(me, 'sales') && ['/orders/new', 'ph-file-plus', 'New quotation'],
    boss && ['/inventory/grn/new', 'ph-truck', 'Receive goods'],
    boss && ['/inventory/issue/new', 'ph-arrows-left-right', 'Issue to line'],
    boss && ['/production/dpr/new', 'ph-gear-six', 'Enter production'],
  ].filter(Boolean)

  return (
    <>
      <div className="page-help">
        <i className="ph ph-house page-help-ic" aria-hidden="true" />
        <div><p>Hello {me.full_name.split(' ')[0]}. Boxes with a red number have work waiting — tap one to start.</p></div>
      </div>

      {groups.map(([title, list]) => (
        <section key={title}>
          <h2 className="todo-sec">{title}</h2>
          <div className="todo-grid">
            {list.map(([icon, n, label, href]) => (
              <Link prefetch={false} key={href} href={href} className={`todo ${n > 0 ? 'hot' : 'calm'}`}>
                <LinkBusy />
                <i className={`ph ${icon} todo-ic`} aria-hidden="true" />
                <div>
                  <div className="todo-n">{qty(n || 0)}</div>
                  <div className="todo-l">{label}</div>
                </div>
                <i className="ph ph-caret-right todo-go" aria-hidden="true" />
              </Link>
            ))}
          </div>
        </section>
      ))}

      {shortcuts.length > 0 && (
        <section>
          <h2 className="todo-sec">Start something new</h2>
          <div className="row" style={{ gap: 12 }}>
            {shortcuts.map(([href, icon, label]) => (
              <Link prefetch={false} key={href} href={href} className="btn btn-primary btn-lg"><LinkBusy /><i className={`ph ${icon}`} />{label}</Link>
            ))}
          </div>
        </section>
      )}
    </>
  )
}
