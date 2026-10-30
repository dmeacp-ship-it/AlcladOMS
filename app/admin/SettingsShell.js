'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LinkBusy } from '../ui'

const ADMIN_NAV = [
  { href: '/admin/settings', label: 'Company', icon: 'ph-gear' },
  { href: '/admin/customers', label: 'Customers', icon: 'ph-buildings' },
  { href: '/admin/items', label: 'Items', icon: 'ph-cube' },
  { href: '/admin/plants', label: 'Plants', icon: 'ph-factory' },
  { href: '/admin/stores', label: 'Stores & Lines', icon: 'ph-warehouse' },
  { href: '/admin/materials', label: 'Materials', icon: 'ph-package' },
  { href: '/admin/vendors', label: 'Vendors', icon: 'ph-truck' },
  { href: '/admin/bom', label: 'BOM & Recipes', icon: 'ph-receipt' },
  { href: '/admin/users', label: 'Users', icon: 'ph-users-three' },
  { href: '/admin/activity', label: 'Activity Log', icon: 'ph-clock-counter-clockwise' },
]

const MANAGER_NAV = [
  { href: '/admin/bom', label: 'BOM & Recipes', icon: 'ph-receipt' },
]

export default function SettingsShell({ role, children }) {
  const pathname = usePathname()

  // /admin/reports is a top-level section with its own layout/tabs, not Settings
  if (pathname.startsWith('/admin/reports')) {
    return <>{children}</>
  }

  const navItems = role === 'manager' ? MANAGER_NAV : ADMIN_NAV

  // One row of tabs, the same as every other area: no second sidebar eating the table's width.
  return (
    <>
      <nav className="tabs settings-tabs" aria-label="Settings">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/admin/settings' && pathname.startsWith(item.href))
          return (
            <Link key={item.href} href={item.href} className={`tab${isActive ? ' on' : ''}`} aria-current={isActive ? 'page' : undefined}>
              <LinkBusy />
              <i className={`ph ${item.icon}`} />{item.label}
            </Link>
          )
        })}
      </nav>
      {children}
    </>
  )
}
