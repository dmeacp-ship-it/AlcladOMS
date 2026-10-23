'use client'
import Link from 'next/link'
import Form from 'next/form'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import { LinkBusy } from './ui'

const LIST_TITLES = {
  '': ['All Orders', 'Every quotation and order'],
  ACTIVE: ['Active Orders', 'Orders still in progress — approve, DO, dispatch, PI and tax invoice right here'],
  PENDING: ['Pending Approval', 'Quotations waiting for a decision'],
  APPROVED: ['Approved Orders', 'Approved quotations in progress'],
  REJECTED: ['Rejected Quotations', 'Duplicate one to resubmit it'],
  CANCELLED: ['Cancelled Orders', 'Orders cancelled before delivery'],
  AWAIT_DO: ['Awaiting DO', 'Approved orders that need a Delivery Order'],
  AWAIT_DISPATCH: ['Awaiting Dispatch', 'DOs the plant has not fully dispatched yet'],
  AWAIT_PI: ['Awaiting PI', 'Orders with a DO that need a Proforma Invoice'],
  AWAIT_TAX: ['Awaiting Tax Invoice', 'Invoiced orders without an uploaded tax invoice'],
}
const PAGES = [
  [/^\/orders\/new/, 'New Quotation', 'Pick the customer and line items, then submit for approval'],
  [/^\/orders\/\d+\/edit/, 'Edit Order', 'Admin correction: customer, salesperson, lines and prices'],
  [/^\/admin\/settings/, 'Company Settings', 'Company, documents, VAT, numbering and approval rules'],
  [/^\/admin\/activity/, 'Activity Log', 'Who did what, and when'],
  [/^\/admin\/reports/, 'Reports', 'Sales, waiting times and dispatch performance'],
  [/^\/orders\/\d+\/print/, 'Print Document', 'Print it or choose “Save as PDF”'],
  [/^\/plant/, 'Plant Dispatch', 'Dispatch DO lines one by one — part quantities allowed'],
  [/^\/admin\/customers/, 'Customers', 'Customer master'],
  [/^\/admin\/items/, 'Items', 'Finished goods SKU master'],
  [/^\/admin\/users/, 'Users', 'Logins and roles'],
]

// Sidebar + topbar around every signed-in page, as in the FMS app.
export default function Shell({ me, nav, settings, logout, children }) {
  const pathname = usePathname()
  const inSettings = settings.some((s) => pathname.startsWith(s.href))
  // Settings popover: closes on navigation, outside click and Esc.
  const [setOpen, setSetOpen] = useState(false)
  const setRef = useRef(null)
  useEffect(() => setSetOpen(false), [pathname])
  useEffect(() => {
    if (!setOpen) return
    const out = (e) => { if (!setRef.current?.contains(e.target)) setSetOpen(false) }
    const esc = (e) => { if (e.key === 'Escape') setSetOpen(false) }
    document.addEventListener('mousedown', out)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', out); document.removeEventListener('keydown', esc) }
  }, [setOpen])
  const sp = useSearchParams()
  const status = sp.get('status') || ''
  const router = useRouter()
  const [refreshing, startRefresh] = useTransition()
  useEffect(() => {
    if (!refreshing) return
    document.documentElement.dataset.busy = '1'
    return () => { delete document.documentElement.dataset.busy }
  }, [refreshing])
  const [dark, setDark] = useState(false)
  const [toast, setToast] = useState(null)
  useEffect(() => setDark(document.documentElement.dataset.theme === 'dark'), [])

  // ?ok= / ?error= from a server action -> island toast, then drop them from the URL.
  const msg = sp.get('error') || sp.get('ok')
  const kind = sp.get('error') ? 'error' : 'success'
  useEffect(() => {
    if (!msg) return
    setToast({ msg, kind, id: Date.now() })
    const url = new URL(window.location.href)
    url.searchParams.delete('ok')
    url.searchParams.delete('error')
    window.history.replaceState(null, '', url)
  }, [msg, kind])
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), toast.kind === 'error' ? 7000 : 4000)
    return () => clearTimeout(t)
  }, [toast])

  const active = (href) => {
    const [path, query] = href.split('?')
    if (query) return pathname === path && query === `status=${status}`
    if (path === '/orders') return pathname === '/orders' && !status
    return pathname.startsWith(path)
  }
  const [title, sub] = pathname === '/orders'
    ? LIST_TITLES[status] || LIST_TITLES['']
    : (PAGES.find(([re]) => re.test(pathname)) || [null, 'TAS OMS', '']).slice(1)
  const item = (n) => (
    <Link key={n.href} href={n.href} className={`ni${active(n.href) ? ' active' : ''}`} title={n.label}>
      <LinkBusy />
      <i className={`ph ${n.icon}`} />
      <span className="ni-txt">{n.label}</span>
      {n.badge > 0 && <span className="ni-bd">{n.badge}</span>}
    </Link>
  )
  const initials = me.full_name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()

  function toggleSb() {
    const col = document.documentElement.dataset.sb !== 'col'
    if (col) document.documentElement.dataset.sb = 'col'
    else delete document.documentElement.dataset.sb
    try { localStorage.sb_collapsed = col } catch {}
  }

  // Circular reveal from the click point (FMS toggleTheme).
  function toggleTheme(e) {
    const next = !dark
    const apply = () => {
      setDark(next)
      if (next) document.documentElement.dataset.theme = 'dark'
      else delete document.documentElement.dataset.theme
      try { localStorage.theme = next ? 'dark' : 'light' } catch {}
    }
    if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) return apply()
    const b = e.currentTarget.getBoundingClientRect() // from the button, so keyboard use works too
    const x = b.left + b.width / 2
    const y = b.top + b.height / 2
    const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))
    document.startViewTransition(apply).ready.then(() => {
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
        { duration: 500, easing: 'cubic-bezier(0.25, 0.8, 0.25, 1)', pseudoElement: '::view-transition-new(root)' },
      )
    })
  }

  return (
    <div className="app">
      <aside className="sb" aria-label="Main navigation">
        <div className="sb-nav-wrapper">
          <button type="button" className="sb-brand" onClick={toggleSb} aria-label="Collapse or expand the sidebar">
            {/* Same mark as the favicon (app/icon.svg) */}
            <div className="sb-logo"><svg viewBox="12 16 40 34" aria-hidden="true"><path d="M12 50V30l11 7v-7l11 7v-7l11 7V16h7v34z" /></svg></div>
            <div>
              <div className="sb-name">TAS OMS</div>
              <div className="sb-sub">TAS International Mfg.</div>
            </div>
          </button>
          <nav className="sb-nav">
            {nav.map((n, i) => n.section ? <div key={i} className="nsec">{n.section}</div> : item(n))}
          </nav>
        </div>
        <div className="sb-bottom-wrapper">
          {settings.length > 0 && (
            <div ref={setRef} className={`sb-set${setOpen ? ' open' : ''}`}>
              {setOpen && <nav id="sb-settings" className="sb-pop" aria-label="Settings">{settings.map(item)}</nav>}
              <button type="button" className={`ni sb-set-btn${inSettings ? ' active' : ''}`} title="Settings"
                aria-expanded={setOpen} aria-controls="sb-settings" onClick={() => setSetOpen(!setOpen)}>
                <i className="ph ph-gear-six" />
                <span className="ni-txt">Settings</span>
                <i className="ph ph-caret-right sb-caret" aria-hidden="true" />
              </button>
            </div>
          )}
          <div className="sb-user">
            <div className="av" aria-hidden="true">{initials}</div>
            <div className="sb-ui">
              <div className="sb-uname">{me.full_name}</div>
              <span className={`rtag rt-${me.role}`}>{me.role}</span>
            </div>
            <form action={logout}>
              <button className="logout-btn" title="Logout" aria-label="Logout"><i className="ph ph-power" /></button>
            </form>
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="tb-l">
            <h1>{title}</h1>
            <span>{sub}</span>
          </div>
          <div className="tb-r">
            <Form action="/orders" className="gsearch" role="search">
              <i className="ph ph-magnifying-glass" aria-hidden="true" />
              <input name="q" placeholder="Search quotes, customers…" aria-label="Search orders" />
            </Form>
            <button type="button" className="btn btn-ghost btn-sm btn-ic" onClick={toggleTheme} title="Toggle dark / light mode" aria-label="Toggle dark or light mode">
              <i className={`ph ${dark ? 'ph-sun' : 'ph-moon'}`} />
            </button>
            <button type="button" className={`btn btn-success btn-sm btn-ic${refreshing ? ' spinning' : ''}`} title="Refresh data" aria-label="Refresh data"
              onClick={() => startRefresh(() => router.refresh())}>
              <i className="ph ph-arrow-clockwise" />
            </button>
          </div>
        </header>
        <main className="content">{children}</main>
      </div>

      <div id="toasts" role="status" aria-live="polite">
        {toast && (
          <div key={toast.id} className={`toast t-${toast.kind}`}>
            <i className={`ph ${toast.kind === 'error' ? 'ph-warning-circle' : 'ph-check-circle'}`} />
            <span className="toast-msg">{toast.msg}</span>
            <button type="button" className="toast-x" onClick={() => setToast(null)} aria-label="Dismiss"><i className="ph ph-x" /></button>
          </div>
        )}
      </div>
    </div>
  )
}
