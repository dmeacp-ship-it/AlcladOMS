'use client'
import Link from 'next/link'
import Form from 'next/form'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import { LinkBusy, TableLabels, Tooltips } from './ui'

const LIST_TITLES = {
  '': ['Orders', 'Every quotation and order'],
  ACTIVE: ['Orders', 'Orders in progress: approve, DO, PI and tax invoice'],
  PENDING: ['Pending Approval', 'Quotations waiting for a decision'],
  APPROVED: ['Approved Orders', 'Approved quotations in progress'],
  REJECTED: ['Rejected Quotations', 'Duplicate one to resubmit it'],
  CANCELLED: ['Cancelled Orders', 'Orders cancelled before delivery'],
  AWAIT_DO: ['Awaiting DO', 'Approved orders that need a Delivery Order'],
  AWAIT_DISPATCH: ['Awaiting Dispatch', 'DOs the plant has not fully dispatched yet'],
  AWAIT_PI: ['Awaiting PI', 'Delivery Orders that need a Proforma Invoice'],
  AWAIT_TAX: ['Awaiting Tax Invoice', 'Proforma Invoices without an uploaded tax invoice'],
}
const PAGES = [
  [/^\/orders\/new/, 'New Quotation', 'Pick the customer and line items, then submit for approval'],
  [/^\/orders\/\d+\/edit/, 'Edit Order', 'Admin correction: customer, salesperson, lines and prices'],
  [/^\/admin\/settings/, 'Company Settings', 'Company, documents, VAT, numbering and approval rules'],
  [/^\/admin\/activity/, 'Activity Log', 'Who did what, and when'],
  [/^\/admin\/reports\/salespeople/, 'Reports · Salespeople', 'Quotes, approvals and value per salesperson'],
  [/^\/admin\/reports\/customers/, 'Reports · Customers', 'Quotes, approvals and value per customer'],
  [/^\/admin\/reports\/waiting/, 'Reports · Waiting', 'What is waiting right now, and for how long'],
  [/^\/admin\/reports\/dispatch/, 'Reports · Dispatch', 'Delivery orders and lead times'],
  [/^\/admin\/reports/, 'Sales Report', 'Sales, waiting times and dispatch performance'],
  [/^\/orders\/\d+\/print/, 'Print Document', 'Print it, or choose “Save as PDF” as the printer'],
  [/^\/plant/, 'Production Floor', 'Mark finished pieces ready, then ship them'],
  [/^\/admin\/customers/, 'Customers', 'Customer master'],
  [/^\/admin\/items/, 'Items', 'One list per column; quotes combine them'],
  [/^\/admin\/users/, 'Users', 'Logins and roles'],
  [/^\/admin\/plants/, 'Plants', 'Factories; every store belongs to one'],
  [/^\/admin\/stores/, 'Stores', 'Raw material stores, production lines, finished goods and scrap stores'],
  [/^\/admin\/materials/, 'Materials', 'Raw materials and consumables, with min / max stock levels'],
  [/^\/admin\/vendors/, 'Vendors', 'Suppliers for purchase orders'],
  [/^\/inventory\/po/, 'Purchase Orders', 'Order raw material from a supplier'],
  [/^\/inventory\/grn/, 'Receive Goods', 'When goods arrive: enter what came, then check it'],
  [/^\/inventory\/issue/, 'Issue to Line', 'Send raw material from the store to a production line'],
  [/^\/inventory\/adjust/, 'Stock Correction', 'Fix the stock after a count, or load the starting stock'],
  [/^\/inventory/, 'Raw Material Stock', 'How much raw material is in each store and line'],
  [/^\/production\/plan/, 'Production Plan', 'What one line makes in one shift'],
  [/^\/production\/dpr/, 'Enter Production', 'What each line made in a shift, and the raw material it used'],
  [/^\/production\/qc/, 'Check Finished Goods', 'Check new pieces before they go into the finished goods store'],
  [/^\/production\/fg/, 'Finished Goods Stock', 'Finished pieces by product and size'],
  [/^\/production\/reports/, 'Production Report', 'How much was made, rejected and used'],
  [/^\/production/, 'Plan Production', 'What customer orders still need, and what to make'],
]

// Closes a popover on outside press and Esc while it is open.
function useDismiss(open, setOpen, ref) {
  useEffect(() => {
    if (!open) return
    const out = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    const esc = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', out)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', out); document.removeEventListener('keydown', esc) }
  }, [open, setOpen, ref])
}

// Sidebar + topbar around every signed-in page, as in the FMS app. On phones the sidebar becomes a bottom
// tab bar of at most five tabs: the main pages plus More, which holds Reports, the admin pages and Log out.
export default function Shell({ me, nav, settings, logout, children }) {
  const pathname = usePathname()
  const inSettings = settings.some((s) => pathname.startsWith(s.href))
  const [setOpen, setSetOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const setRef = useRef(null)
  const moreRef = useRef(null)
  useEffect(() => { setSetOpen(false); setMoreOpen(false) }, [pathname])
  useDismiss(setOpen, setSetOpen, setRef)
  useDismiss(moreOpen, setMoreOpen, moreRef)
  // Report tabs scroll sideways on phones: keep the open one in view.
  useEffect(() => { document.querySelector('.tabs .tab.on')?.scrollIntoView({ inline: 'center', block: 'nearest' }) }, [pathname])
  // After moving to another page, start keyboard and screen-reader users at its content (not on the first load).
  const firstPath = useRef(pathname)
  useEffect(() => {
    if (pathname === firstPath.current) return
    firstPath.current = null
    if (!document.querySelector('dialog[open]')) document.getElementById('main')?.focus({ preventScroll: true })
  }, [pathname])
  const sp = useSearchParams()
  const status = sp.get('status') || ''
  const router = useRouter()
  const [refreshing, startRefresh] = useTransition()
  useEffect(() => {
    if (!refreshing) return
    document.documentElement.dataset.busy = '1'
    return () => { delete document.documentElement.dataset.busy }
  }, [refreshing])
  // Moving between pages: no skeleton (it held finished pages back), so every link the app opens itself shows
  // the top bar until the new page is in. Next's Link cancels the browser's own navigation, which is how those
  // links are told apart from downloads, new tabs and plain links; 10 s at most if a page never arrives.
  const here = `${pathname}?${sp}`
  const [leaving, setLeaving] = useState(false)
  useEffect(() => {
    const click = (e) => {
      const a = e.target.closest?.('a[href]')
      if (!a || !e.defaultPrevented || a.target) return
      const u = new URL(a.href)
      if (u.origin === location.origin && u.pathname + u.search !== location.pathname + location.search) setLeaving(true)
    }
    document.addEventListener('click', click)
    return () => document.removeEventListener('click', click)
  }, [])
  useEffect(() => setLeaving(false), [here])
  useEffect(() => {
    if (!leaving) return
    document.documentElement.dataset.busy = '1'
    const t = setTimeout(() => setLeaving(false), 10000)
    return () => { clearTimeout(t); delete document.documentElement.dataset.busy }
  }, [leaving])
  const [dark, setDark] = useState(false)
  const [toast, setToast] = useState(null)
  const [online, setOnline] = useState(true)
  useEffect(() => setDark(document.documentElement.dataset.theme === 'dark'), [])
  useEffect(() => {
    const on = () => setOnline(navigator.onLine)
    on()
    addEventListener('online', on)
    addEventListener('offline', on)
    return () => { removeEventListener('online', on); removeEventListener('offline', on) }
  }, [])

  // ?ok= / ?error= from a server action -> toast, then drop them from the URL.
  const msg = sp.get('error') || sp.get('ok')
  const kind = sp.get('error') ? 'error' : 'success'
  useEffect(() => {
    if (!msg) return
    setToast({ msg, kind, id: Date.now() })
    const url = new URL(window.location.href)
    url.searchParams.delete('ok')
    url.searchParams.delete('error')
    window.history.replaceState(window.history.state, '', url)
  }, [msg, kind])
  // Success messages leave by themselves; errors stay until they are dismissed.
  useEffect(() => {
    if (toast?.kind !== 'success') return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  // The link whose path is the longest match lights up (on /inventory/po: Purchase Orders, not Raw Material Stock).
  const best = [...nav, ...settings].map((n) => n.href?.split('?')[0])
    .filter((p) => p && (pathname === p || pathname.startsWith(`${p}/`))).sort((a, b) => b.length - a.length)[0]
  const active = (href) => {
    const [path, query] = href.split('?')
    if (query) return pathname === path && query === `status=${status}`
    if (path === '/orders') return pathname === '/orders' && !status
    return path === best
  }
  const [title, sub] = pathname === '/orders'
    ? LIST_TITLES[status] || LIST_TITLES['']
    : (PAGES.find(([re]) => re.test(pathname)) || [null, 'TAS OMS', '']).slice(1)
  // prefetch={false} on every Link in the app: pages depend on the signed-in user and are never cached,
  // so background prefetches only cost a login check and a server render each, without speeding anything up.
  const item = (n) => (
    <Link prefetch={false} key={n.href} href={n.href} className={`ni${active(n.href) ? ' active' : ''}${n.more ? ' phone-more' : ''}`}
      aria-current={active(n.href) ? 'page' : undefined} title={n.label}>
      <LinkBusy />
      <i className={`ph ${n.icon}`} />
      <span className="ni-txt">{n.label}</span>
      {/* Phone tab bar: one-word label so every icon sits on the same line */}
      {n.short && <span className="ni-short">{n.short}</span>}
      {n.badge > 0 && <span className="ni-bd" aria-label={`${n.badge} waiting`}>{n.badge}</span>}
    </Link>
  )
  const moreItems = [...nav.filter((n) => n.more), ...settings]
  // The More sheet keeps the sidebar's group headings (only those with a page in the sheet).
  const moreList = [...nav, { section: 'Settings' }, ...settings]
    .filter((n, i, all) => (n.section ? all.slice(i + 1).find((m) => m.section || m.more || settings.includes(m))?.href : n.more || settings.includes(n)))
  // Phone tab bar: the main pages plus More, all the same width
  const tabs = nav.filter((n) => n.href && !n.more).length + 1
  const initials = me.full_name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()

  // The logo collapses the sidebar to a rail, or opens it again. Between 769 and 1365 px it starts as a rail.
  function toggleSb() {
    const isRail = document.querySelector('.sb').getBoundingClientRect().width < 120
    document.documentElement.dataset.sb = isRail ? 'open' : 'col'
    try { localStorage.sb = isRail ? 'open' : 'col'; localStorage.removeItem('sb_collapsed') } catch {}
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
        { duration: 400, easing: 'cubic-bezier(0.25, 0.8, 0.25, 1)', pseudoElement: '::view-transition-new(root)' },
      )
    })
  }

  // Group nav items into top-level items and collapsible sections
  const groups = []
  let currentGroup = { section: null, items: [] }
  groups.push(currentGroup)
  for (const n of nav) {
    if (n.section) {
      currentGroup = { section: n.section, items: [] }
      groups.push(currentGroup)
    } else {
      currentGroup.items.push(n)
    }
  }

  // Server & initial client render: deterministically collapse all sections except the active one
  const allSecs = groups.filter((g) => g.section).map((g) => g.section)
  const activeSec = groups.find((g) => g.section && g.items.some((n) => active(n.href)))?.section
  const keepOpen = activeSec || 'Sales'
  const defaultCollapsed = allSecs.filter((s) => s !== keepOpen)

  const [collapsed, setCollapsed] = useState(defaultCollapsed)

  // Load saved preferences from localStorage on mount (client-only) to avoid SSR hydration mismatch
  useEffect(() => {
    try {
      const saved = localStorage.getItem('tas_sb_collapsed')
      if (saved !== null) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed)) {
          const currentActive = groups.find((g) => g.section && g.items.some((n) => active(n.href)))?.section
          const next = currentActive ? parsed.filter((s) => s !== currentActive) : parsed
          setCollapsed(next)
        }
      }
    } catch {}
  }, [])

  const toggleSection = (sec) => {
    setCollapsed((prev) => {
      const next = prev.includes(sec) ? prev.filter((s) => s !== sec) : [...prev, sec]
      try { localStorage.setItem('tas_sb_collapsed', JSON.stringify(next)) } catch {}
      return next
    })
  }

  useEffect(() => {
    const activeSec = groups.find((g) => g.section && g.items.some((n) => active(n.href)))?.section
    if (activeSec && collapsed.includes(activeSec)) {
      setCollapsed((prev) => {
        const next = prev.filter((s) => s !== activeSec)
        try { localStorage.setItem('tas_sb_collapsed', JSON.stringify(next)) } catch {}
        return next
      })
    }
  }, [pathname, status])

  return (
    <div className="app">
      <a href="#main" className="skip-link">Skip to content</a>
      <aside className="sb" aria-label="Main navigation" style={{ '--tabs': tabs }}>
        <button type="button" className="sb-brand" onClick={toggleSb} aria-label="Collapse or expand the sidebar">
          {/* Same mark as the favicon (app/icon.svg) */}
          <div className="sb-logo"><svg viewBox="12 16 40 34" aria-hidden="true"><path d="M12 50V30l11 7v-7l11 7v-7l11 7V16h7v34z" /></svg></div>
          <div>
            <div className="sb-name">TAS OMS</div>
            <div className="sb-sub">TAS International Mfg.</div>
          </div>
        </button>
        <div className="sb-nav-wrapper">
          <nav className="sb-nav">
            {groups.map((g) => {
              if (!g.section) {
                return g.items.map(item)
              }
              const isCollapsed = collapsed.includes(g.section)
              const badgeSum = g.items.reduce((acc, n) => acc + (Number(n.badge) || 0), 0)
              return (
                <div key={g.section} className="nsec-group">
                  <button
                    type="button"
                    className={`nsec${isCollapsed ? ' collapsed' : ''}`}
                    onClick={() => toggleSection(g.section)}
                    aria-expanded={!isCollapsed}
                    title={isCollapsed ? `Expand ${g.section}` : `Collapse ${g.section}`}
                  >
                    <i className={`ph ph-caret-${isCollapsed ? 'right' : 'down'} nsec-caret`} aria-hidden="true" />
                    <span className="nsec-title">{g.section}</span>
                    {isCollapsed && badgeSum > 0 && (
                      <span className="ni-bd" aria-label={`${badgeSum} waiting`}>{badgeSum}</span>
                    )}
                  </button>
                  <div className="nsec-items" hidden={isCollapsed}>
                    {g.items.map(item)}
                  </div>
                </div>
              )
            })}
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
          {/* Phones only: the fifth tab */}
          <div ref={moreRef} className="sb-more">
            <button type="button" className={`ni sb-more-btn${moreItems.some((n) => active(n.href)) ? ' active' : ''}`}
              aria-expanded={moreOpen} aria-controls="more-sheet" onClick={() => setMoreOpen(!moreOpen)}>
              <i className="ph ph-dots-three-circle" />
              <span className="ni-short">More</span>
            </button>
            {moreOpen && (
              <>
                <div className="more-scrim" aria-hidden="true" onClick={() => setMoreOpen(false)} />
                <nav id="more-sheet" className="more-sheet" aria-label="More">
                  <div className="more-user"><div className="av sm" aria-hidden="true">{initials}</div><b>{me.full_name}</b><span className={`rtag rt-${me.role}`}>{me.role}</span></div>
                  {moreItems.length > 0 && <div className="more-list">{moreList.map((n, i) => (n.section ? <div key={`s${i}`} className="more-sec">{n.section}</div> : item(n)))}</div>}
                  <button type="button" className="ni" onClick={(e) => { toggleTheme(e); setMoreOpen(false) }}>
                    <i className={`ph ${dark ? 'ph-sun' : 'ph-moon'}`} /><span className="ni-txt">{dark ? 'Light mode' : 'Dark mode'}</span>
                  </button>
                  <form action={logout} className="more-logout">
                    <button className="ni danger"><i className="ph ph-sign-out" /><span className="ni-txt">Log out</span></button>
                  </form>
                </nav>
              </>
            )}
          </div>
          <div className="sb-user">
            <div className="av" aria-hidden="true">{initials}</div>
            <div className="sb-ui">
              <div className="sb-uname">{me.full_name}</div>
            </div>
            <form action={logout}>
              <button className="logout-btn" title="Log out" aria-label="Log out"><i className="ph ph-power" /></button>
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
            <Form action="/orders" prefetch={false} className="gsearch" role="search">
              <i className="ph ph-magnifying-glass" aria-hidden="true" />
              <input name="q" type="search" placeholder="Search quotes, customers…" aria-label="Search orders" />
            </Form>
            <button type="button" className="btn btn-ghost btn-sm btn-ic tb-theme" onClick={toggleTheme} title="Dark or light mode" aria-label="Switch between dark and light mode">
              <i className={`ph ${dark ? 'ph-sun' : 'ph-moon'}`} />
            </button>
            <button type="button" className={`btn btn-success btn-sm btn-ic${refreshing ? ' spinning' : ''}`} title="Refresh data" aria-label="Refresh data"
              onClick={() => startRefresh(() => router.refresh())}>
              <i className="ph ph-arrow-clockwise" />
            </button>
          </div>
        </header>
        <main id="main" className="content" tabIndex={-1}>
          {!online && (
            <div className="banner warn offline" role="status"><i className="ph ph-wifi-slash" />You're offline. Pages and changes can't load or save until the connection is back.</div>
          )}
          {children}
        </main>
      </div>

      <Tooltips />
      <TableLabels />
      <div id="toasts" role="status" aria-live="polite">
        {toast?.kind === 'success' && (
          <div key={toast.id} className="toast t-success">
            <i className="ph ph-check-circle" />
            <span className="toast-msg">{toast.msg}</span>
            <button type="button" className="toast-x" onClick={() => setToast(null)} aria-label="Dismiss"><i className="ph ph-x" /></button>
          </div>
        )}
      </div>
      <div id="toast-errors" role="alert">
        {toast?.kind === 'error' && (
          <div key={toast.id} className="toast t-error">
            <i className="ph ph-warning-circle" />
            <span className="toast-msg">{toast.msg}</span>
            <button type="button" className="toast-x" onClick={() => setToast(null)} aria-label="Dismiss"><i className="ph ph-x" /></button>
          </div>
        )}
      </div>
    </div>
  )
}
