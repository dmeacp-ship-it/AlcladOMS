import { unstable_cache } from 'next/cache'
import { db } from './server'

// Supabase free-plan usage (migrate-012), checked at most once an hour. Egress (data sent out) has no API
// on the free plan, so the panel links to the Supabase dashboard for it.
export const LIMITS = { db_bytes: ['Database size', 500e6], storage_bytes: ['File storage', 1e9], mau: ['Monthly active users', 50000] }
export const WARN = 0.8

const cached = unstable_cache(async () => {
  const { data, error } = await db().rpc('app_usage')
  if (error) throw error // not cached, so it shows as soon as migrate-012 runs
  return Object.entries(LIMITS).map(([k, [label, max]]) => ({ key: k, label, used: Number(data[k]) || 0, max, share: (Number(data[k]) || 0) / max }))
}, ['usage'], { revalidate: 3600 })
export const getUsage = () => cached().catch(() => null)
