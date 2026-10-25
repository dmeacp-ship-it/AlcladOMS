import './globals.css'
import '@phosphor-icons/web/regular'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { authClient, currentUser, openLineCount, orderCounts, sessionUserId } from '@/lib/server'
import { can } from '@/lib/tas'
import { WARN, getUsage } from '@/lib/usage'
import Shell from './Shell'

// Each page sets its own name; the tab reads "Plant Dispatch · TAS OMS".
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
  // Profile and badge counts in parallel (one database round trip, not two); no counts when signed out.
  // orderCounts(null): same arguments as the Orders page, so the cached result is shared.
  const signedIn = !!(await sessionUserId())
  const [me, c] = await Promise.all([currentUser(), signedIn ? orderCounts(null) : null])
  const lines = me && can(me, 'plant') ? await openLineCount() : 0
  let nav = []
  let settings = []
  if (me) {
    // Active Orders badge = orders waiting on something this user's role does.
    const waiting = [
      can(me, 'plant') ? c.AWAIT_DISPATCH : 0,
      can(me, 'approver') ? c.PENDING : 0,
      can(me, 'accounts') ? c.AWAIT_PI + c.AWAIT_TAX : 0,
      can(me, 'operations') ? c.AWAIT_DO : 0,
    ]
    const todo = waiting.reduce((a, b) => a + b, 0)
    nav = [
      { section: 'Workflow' },
      { href: '/orders?status=ACTIVE', label: 'Active Orders', short: 'Active', icon: 'ph-lightning', badge: todo },
      can(me, 'sales') && { href: '/orders/new', label: 'New Quotation', short: 'New Quote', icon: 'ph-file-plus' },
      // Badge in lines, the unit the Plant Dispatch page counts in.
      can(me, 'plant') && { href: '/plant', label: 'Plant Dispatch', short: 'Plant', icon: 'ph-factory', badge: lines },
      { href: '/orders', label: 'All Orders', short: 'Orders', icon: 'ph-list-checks' },
      // more: on phones it sits in the More tab, so the tab bar keeps five tabs.
      ['admin', 'manager'].includes(me.role) && { href: '/admin/reports', label: 'Reports', icon: 'ph-chart-bar', more: true },
    ].filter(Boolean)
    // Admin masters sit in the Settings group at the bottom of the sidebar.
    if (me.role === 'admin') settings = [
      { href: '/admin/settings', label: 'Company', icon: 'ph-gear' },
      { href: '/admin/customers', label: 'Customers', icon: 'ph-buildings' },
      { href: '/admin/items', label: 'Items', icon: 'ph-cube' },
      { href: '/admin/users', label: 'Users', icon: 'ph-users-three' },
      { href: '/admin/activity', label: 'Activity Log', icon: 'ph-clock-counter-clockwise' },
    ]
  }
  // Admins see a warning on every page once any free-plan limit passes 80% (checked hourly).
  const near = me?.role === 'admin' ? (await getUsage())?.filter((u) => u.share >= WARN) : null
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME }} />
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
