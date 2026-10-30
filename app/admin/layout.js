import { currentUser } from '@/lib/server'
import SettingsShell from './SettingsShell'

export const metadata = {
  title: { default: 'Settings', template: '%s · Settings · TAS OMS' },
}

export default async function AdminLayout({ children }) {
  const me = await currentUser()
  return <SettingsShell role={me?.role || 'admin'}>{children}</SettingsShell>
}
