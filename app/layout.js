if (process.env.NODE_ENV === 'development') {
  const origError = console.error
  console.error = (...args) => {
    if (typeof args[0] === 'string' && args[0].includes('Encountered a script tag')) return
    origError.apply(console, args)
  }
}

import './globals.css'
import './icons/phosphor.css' // only the icons in use: npm run icons
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { MY_WORK, authClient, currentUser, myWorkIds, openLineCount, orderCounts, sessionUserId } from '@/lib/server'
import { can } from '@/lib/tas'
import { WARN, getUsage } from '@/lib/usage'
import { invTodo } from '@/lib/todo'
import Shell from './Shell'

// Each page sets its own name; the tab reads "Production Floor · TAS OMS".
// viewport-fit=cover: the phone bottom tab bar pads itself for the home indicator (safe-area-inset-bottom).
export const viewport = {
  viewportFit: 'cover',
  themeColor: [{ media: '(prefers-color-scheme: light)', color: '#F2F2F7' }, { media: '(prefers-color-scheme: dark)', color: '#000000' }],
}

export const metadata = {
  title: { default: 'TAS OMS', template: '%s · TAS OMS' },
  // iPhone "Add to Home Screen": open full screen with the app's name under the icon.
  appleWebApp: { capable: true, title: 'TAS OMS', statusBarStyle: 'default' },
}

// Runs before first paint so a saved dark theme / sidebar choice never flashes; ?embed=1 (document viewer)
// hides the app frame before anything is drawn. No saved choice -> follow the OS (theme) and the screen width (sidebar).
const THEME = "try{var d=document.documentElement,t=localStorage.theme;if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches))d.dataset.theme='dark';var s=localStorage.sb||(localStorage.sb_collapsed==='true'?'col':'');if(s)d.dataset.sb=s}catch(e){}try{if(/[?&]embed=1/.test(location.search))document.documentElement.classList.add('embed')}catch(e){}"

async function logout() {
  'use server'
  // local: only this browser. Supabase's default ('global') would sign the user out on every device.
  await (await authClient()).auth.signOut({ scope: 'local' })
  revalidatePath('/', 'layout')
  redirect('/login')
}

export default async function RootLayout({ children }) {
  // Profile, badge counts and the admins' usage warning together: one database round trip; nothing when signed out.
  // orderCounts(null): same arguments as the Orders page, so the cached result is shared. The Plant badge comes
  // with the counts (LINES, migrate-014); until that runs, plant users wait for one more query.
  const signedIn = !!(await sessionUserId())
  // inv: store / production waiting work (badges), started alongside so it adds no round trip; used by admin / manager.
  const mePromise = currentUser()
  const myWorkPromise = mePromise.then((me) => (me && MY_WORK[me.role] ? myWorkIds(me.role) : null))
  const [me, c, usage, inv, mineIds] = await Promise.all([
    mePromise,
    signedIn ? orderCounts(null) : null,
    signedIn ? getUsage() : null,
    signedIn ? invTodo() : null,
    myWorkPromise,
  ])
  const lines = me && can(me, 'plant') ? c.LINES ?? await openLineCount() : 0
  let nav = []
  let settings = []
  if (me) {
    // Orders badge = orders waiting on something this user's role does: the My Work list for a single-job role
    // (run concurrently with counts above), every queue added up for admin / manager.
    const todo = mineIds ? mineIds.length : [
      can(me, 'plant') ? c.AWAIT_DISPATCH : 0,
      can(me, 'approver') ? c.PENDING : 0,
      can(me, 'accounts') ? c.AWAIT_PI + c.AWAIT_TAX : 0,
      can(me, 'operations') ? c.AWAIT_DO : 0,
    ].reduce((a, b) => a + b, 0)
    // One link per page, grouped by job, in plain words (no tabs inside pages). Red numbers = work waiting there.
    // more: on phones it sits in the More tab, so the tab bar keeps five tabs.
    const boss = ['admin', 'manager'].includes(me.role)
    nav = [
      { href: '/', label: 'Dashboard', short: 'Home', icon: 'ph-squares-four' },
      { href: '/orders', label: 'Orders', short: 'Orders', icon: 'ph-list-checks', badge: todo },
      ...(boss ? [
        // Flat navigation list: one clean item per major workflow hub
        { href: '/inventory/po', label: 'Purchasing', short: 'Buying', icon: 'ph-shopping-cart', badge: (me.role === 'admin' ? inv.po : 0) + (inv.grn || 0), match: ['/inventory/grn'], more: true },
        can(me, 'plant') && {
          href: '/plant',
          label: 'Production',
          short: 'Floor',
          icon: 'ph-factory',
          badge: lines + (inv.toPlan || 0) + (inv.qc || 0),
          match: ['/plant', '/production', '/production/dpr', '/production/qc', '/production/plan'],
        },
        {
          href: '/inventory',
          label: 'Inventory', short: 'Stock',
          icon: 'ph-warehouse',
          match: ['/inventory', '/production/fg', '/inventory/issue', '/inventory/adjust'],
          more: true,
        },
        { href: '/admin/reports', label: 'Reports', icon: 'ph-chart-bar', match: ['/production/reports'], more: true },
      ] : [
        can(me, 'plant') && { href: '/plant', label: 'Production', short: 'Floor', icon: 'ph-factory', badge: lines },
      ]),
    ].filter(Boolean)
    // Admin masters sit in the Settings group at the bottom of the sidebar.
    if (me.role === 'admin') settings = [
      { href: '/admin/settings', label: 'Company', icon: 'ph-gear' },
      { href: '/admin/customers', label: 'Customers', icon: 'ph-buildings' },
      { href: '/admin/items', label: 'Items', icon: 'ph-cube' },
      { href: '/admin/plants', label: 'Plants', icon: 'ph-factory' },
      { href: '/admin/stores', label: 'Stores & Lines', icon: 'ph-warehouse' },
      { href: '/admin/materials', label: 'Materials', icon: 'ph-package' },
      { href: '/admin/vendors', label: 'Vendors', icon: 'ph-truck' },
      { href: '/admin/users', label: 'Users', icon: 'ph-users-three' },
      { href: '/admin/activity', label: 'Activity Log', icon: 'ph-clock-counter-clockwise' },
    ]
  }
  // Admins see a warning on every page once any free-plan limit passes 80% (checked hourly).
  const near = me?.role === 'admin' ? usage?.filter((u) => u.share >= WARN) : null
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script id="theme-init" src="/theme-init.js" />
      </head>
      <body>
        {me ? (
          <Shell me={{ full_name: me.full_name, role: me.role }} nav={nav} settings={settings} logout={logout}>
            {near?.length > 0 && (
              <a href="/admin/settings" className="banner warn no-print" style={{ marginBottom: 14 }}>
                <i className="ph ph-warning" />Free plan nearly full: {near.map((u) => `${u.label} ${Math.round(u.share * 100)}%`).join(', ')}. See Company Settings.
              </a>
            )}
            {children}
          </Shell>
        ) : children}
      </body>
    </html>
  )
}
