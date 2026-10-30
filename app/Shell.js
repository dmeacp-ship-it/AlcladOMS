'use client'
import Link from 'next/link'
import Form from 'next/form'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import { IntentLink, LinkBusy, MenuCloser, TableLabels, Tooltips } from './ui'

const LIST_TITLES = {
  ALL: ['All orders', 'Every quotation and order'],
  MINE: ['My work', 'Orders waiting for your action'],
  ACTIVE: ['Active orders', 'Approve, make, ship and bill'],
  PENDING: ['To approve', 'Quotations waiting for the approver'],
  APPROVED: ['Approved orders', 'Approved quotations moving through the steps'],
  REJECTED: ['Rejected quotations', 'Duplicate a rejected quote to revise and resubmit'],
  CANCELLED: ['Cancelled orders', 'Orders cancelled before delivery'],
  AWAIT_DO: ['Ready to ship', 'Finished pieces waiting for a Delivery Order'],
  AWAIT_DISPATCH: ['In production', 'Orders being made on the floor'],
  AWAIT_PI: ['Make PI', 'Delivery Orders waiting for a Proforma Invoice'],
  AWAIT_TAX: ['Tax invoice', 'Proforma Invoices waiting for the tax invoice file'],
}
// Roles whose Orders page opens on My work (same keys as MY_WORK in lib/server.js)
const MY_WORK_ROLES = ['approver', 'plant', 'operations', 'accounts']
// Top bar: the area's name (the same word as the sidebar), then what this page or tab does.
const PAGES = [
  [/^\/$/, 'Dashboard', 'Orders, production and work waiting on you'],
  [/^\/orders\/new/, 'New quotation', 'Pick the customer and lines, then submit for approval'],
  [/^\/orders\/\d+\/edit/, 'Edit order', 'Admin correction: customer, salesperson, lines and prices'],
  [/^\/admin\/settings/, 'Settings', 'Company, documents, VAT, numbering and approval rules'],
  [/^\/admin\/activity/, 'Settings', 'Activity log: who did what, and when'],
  [/^\/admin\/reports\/salespeople/, 'Reports', 'Salespeople: quotes, approvals and value'],
  [/^\/admin\/reports\/customers/, 'Reports', 'Customers: quotes, approvals and value'],
  [/^\/admin\/reports\/waiting/, 'Reports', 'Waiting: what is waiting now, and for how long'],
  [/^\/admin\/reports\/dispatch/, 'Reports', 'Dispatch: Delivery Orders and lead times'],
  [/^\/admin\/reports/, 'Reports', 'Sales, waiting times and dispatch'],
  [/^\/orders\/\d+\/print/, 'Print document', 'Print it, or choose “Save as PDF” as the printer'],
  [/^\/plant/, 'Production', 'Ready to ship: mark finished pieces ready, then ship them'],
  [/^\/admin\/customers/, 'Settings', 'Customers'],
  [/^\/admin\/items/, 'Settings', 'Items: one list per column; quotes combine them'],
  [/^\/admin\/users/, 'Settings', 'Users: logins and roles'],
  [/^\/admin\/plants/, 'Settings', 'Plants: every store belongs to one'],
  [/^\/admin\/stores/, 'Settings', 'Stores and production lines'],
  [/^\/admin\/materials/, 'Settings', 'Materials, with min / max stock levels'],
  [/^\/admin\/vendors/, 'Settings', 'Vendors: suppliers for purchase orders'],
  [/^\/admin\/bom/, 'Settings', 'BOM & recipes: material use per M²'],
  [/^\/inventory\/po/, 'Purchasing', 'Purchase orders: order raw material from a supplier'],
  [/^\/inventory\/grn/, 'Purchasing', 'Goods received: enter what came, then check it'],
  [/^\/inventory\/bom/, 'Settings', 'BOM & recipes: material use per M²'],
  [/^\/inventory\/issue/, 'Inventory', 'Issues to line: raw material sent from a store to a line'],
  [/^\/inventory\/adjust/, 'Inventory', 'Stock adjustments'],
  [/^\/inventory/, 'Inventory', 'Raw material in each store and line'],
  [/^\/production\/plan/, 'Production', 'Plan: what one line makes in one shift'],
  [/^\/production\/dpr/, 'Production', 'Shift output: what each line made, and the material it used'],
  [/^\/production\/qc/, 'Production', 'Check pieces before they go into finished goods'],
  [/^\/production\/fg/, 'Inventory', 'Finished goods by product and size'],
  [/^\/production\/reports/, 'Reports', 'Production: made, rejected and used'],
  [/^\/production/, 'Production', 'Planning: what customer orders still need'],
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

function getFallback(path) {
  if (path.startsWith('/orders/new') || path.startsWith('/orders/')) return '/orders'
  if (path.startsWith('/inventory/po/new') || path.startsWith('/inventory/po/')) return '/inventory/po'
  if (path.startsWith('/inventory/grn/')) return '/inventory/po'
  if (path.startsWith('/admin/bom')) return '/admin/settings'
  if (path.startsWith('/inventory/bom')) return '/admin/bom'
  if (path.startsWith('/inventory/issue/')) return '/inventory'
  if (path.startsWith('/inventory/adjust')) return '/inventory'
  if (path.startsWith('/production/dpr/new') || path.startsWith('/production/dpr/')) return '/production/dpr'
  if (path.startsWith('/production/qc')) return '/production/dpr'
  if (path.startsWith('/production/new') || path.startsWith('/production/plan/')) return '/production'
  if (path.startsWith('/admin/reports/')) return '/admin/reports'
  if (path.startsWith('/admin/')) return '/admin/settings'
  return '/'
}

// Sidebar + topbar around every signed-in page, as in the FMS app. On phones the sidebar becomes a bottom
// tab bar of at most five tabs: the main pages plus More, which holds Reports, the admin pages and Log out.
export default function Shell({ me, nav, settings, logout, children }) {
  const pathname = usePathname()
  const inSettings = settings.some((s) => pathname.startsWith(s.href))
  const [moreOpen, setMoreOpen] = useState(false)
  const moreRef = useRef(null)
  useEffect(() => { setMoreOpen(false) }, [pathname])
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
  const canGoBack = pathname !== '/'
  const handleBack = () => {
    if (typeof window !== 'undefined' && window.history.state?.idx > 0) {
      router.back()
    } else {
      router.push(getFallback(pathname))
    }
  }
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
  const [searchOpen, setSearchOpen] = useState(false)
  const searchRef = useRef(null)
  const [toast, setToast] = useState(null)
  const [online, setOnline] = useState(true)
  // The head script sets the theme on a full load; this covers renders it missed (error recovery).
  useEffect(() => {
    let t
    try { t = localStorage.theme } catch {}
    const d = t === 'dark' || (!t && matchMedia('(prefers-color-scheme: dark)').matches)
    if (d) document.documentElement.dataset.theme = 'dark'
    setDark(d)
  }, [])
  useEffect(() => {
    const on = () => setOnline(navigator.onLine)
    on()
    addEventListener('online', on)
    addEventListener('offline', on)
    return () => { removeEventListener('online', on); removeEventListener('offline', on) }
  }, [])

  // Register static asset service worker for instant repeat visits and zero-byte JS/CSS boot
  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }
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

  // The link whose path is the longest match lights up (on /inventory/po: Purchase Orders, not Stock). A link also owns
  // its match pages (Stock lights up on Finished goods and Stock Correction, Record Shift on Check Finished Goods).
  const best = [...nav, ...settings].flatMap((n) => (n.href ? [n.href, ...(n.match || [])].map((p) => [p.split('?')[0], n.href]) : []))
    .filter(([p]) => pathname === p || pathname.startsWith(`${p}/`)).sort((a, b) => b[0].length - a[0].length)[0]?.[1]
  const active = (href) => {
    const [path, query] = href.split('?')
    if (query) return pathname === path && query === `status=${status}`
    if (path === '/orders') return pathname === '/orders' && !status
    return href === best
  }
  const [title, sub] = pathname === '/orders'
    ? LIST_TITLES[status] || LIST_TITLES[sp.get('show') === 'all' ? 'ALL' : MY_WORK_ROLES.includes(me.role) ? 'MINE' : 'ACTIVE']
    : (PAGES.find(([re]) => re.test(pathname)) || [null, 'TAS OMS', '']).slice(1)
  // IntentLink prefetches on hover/touch (150-300 ms head start).
  // staleTimes.dynamic: 30 keeps the prefetched page ready for 30s.
  const item = (n) => (
    <IntentLink key={n.href} href={n.href} className={`ni${active(n.href) ? ' active' : ''}${n.more ? ' phone-more' : ''}`}
      aria-current={active(n.href) ? 'page' : undefined} title={n.label}>
      <LinkBusy />
      <i className={`ph ${n.icon}`} />
      <span className="ni-txt">{n.label}</span>
      {n.badge > 0 && <span className="ni-bd" aria-label={`${n.badge} steps waiting on you`} title={`${n.badge} steps waiting on you`}>{n.badge}</span>}
    </IntentLink>
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
    // A second click or a navigation can abort the transition; the theme is applied either way.
    try {
      document.startViewTransition(apply).ready.then(() => {
        document.documentElement.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
          { duration: 400, easing: 'cubic-bezier(0.25, 0.8, 0.25, 1)', pseudoElement: '::view-transition-new(root)' },
        )
      }, () => {})
    } catch { apply() }
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
            <IntentLink
              href={settings[0]?.href || '/admin/settings'}
              className={`ni sb-set-btn${inSettings ? ' active' : ''}`}
              title="Settings"
              aria-current={inSettings ? 'page' : undefined}
            >
              <LinkBusy />
              <i className="ph ph-gear-six" />
              <span className="ni-txt">Settings</span>
            </IntentLink>
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
                  <div className="more-quick">
                    <button type="button" className="ni" onClick={(e) => { toggleTheme(e); setMoreOpen(false) }}>
                      <i className={`ph ${dark ? 'ph-sun' : 'ph-moon'}`} /><span className="ni-txt">{dark ? 'Light mode' : 'Dark mode'}</span>
                    </button>
                    <form action={logout} className="more-logout">
                      <button className="ni danger"><i className="ph ph-sign-out" /><span className="ni-txt">Log out</span></button>
                    </form>
                  </div>
                  {moreItems.length > 0 && <div className="more-list">{moreList.map((n, i) => (n.section ? <div key={`s${i}`} className="more-sec">{n.section}</div> : item(n)))}</div>}
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
            {canGoBack && (
              <button
                type="button"
                className="btn btn-ghost btn-sm btn-ic tb-back"
                onClick={handleBack}
                title="Go back"
                aria-label="Go back"
              >
                <i className="ph ph-arrow-left" />
              </button>
            )}
            <div className="tb-titles">
              <h1>{title}</h1>
              <span>{sub}</span>
            </div>
          </div>
          <div className="tb-r">
            {/* Orders has its own list search, so the top one is left out there. Phones: a search button opens it. */}
            {pathname !== '/orders' && (
              <>
                <Form action="/orders" prefetch={false} className={`gsearch${searchOpen ? ' open' : ''}`} role="search">
                  <input type="hidden" name="show" value="all" />
                  <i className="ph ph-magnifying-glass" aria-hidden="true" />
                  <input ref={searchRef} name="q" type="search" placeholder="Search quotes, customers…" aria-label="Search all orders"
                    onBlur={() => setSearchOpen(false)} />
                </Form>
                <button type="button" className="btn btn-ghost btn-sm btn-ic tb-search" aria-label="Search all orders"
                  onClick={() => { setSearchOpen(true); requestAnimationFrame(() => searchRef.current?.focus()) }}>
                  <i className="ph ph-magnifying-glass" />
                </button>
              </>
            )}
            <button type="button" className="btn btn-ghost btn-sm btn-ic tb-theme" onClick={toggleTheme} title="Dark or light mode" aria-label="Switch between dark and light mode">
              <i className={`ph ${dark ? 'ph-sun' : 'ph-moon'}`} />
            </button>
            <button type="button" className={`btn btn-ghost btn-sm btn-ic tb-refresh${refreshing ? ' spinning' : ''}`} title="Refresh data" aria-label="Refresh data"
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
      <MenuCloser />
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
