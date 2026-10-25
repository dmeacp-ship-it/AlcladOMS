import { unstable_cache } from 'next/cache'
import { db } from './server'

// Supabase free-plan usage (migrate-012). Egress (data sent out) has no API on the free plan, so the panel
// links to the Supabase dashboard for it.
export const LIMITS = { db_bytes: ['Database size', 500e6], storage_bytes: ['File storage', 1e9], mau: ['Monthly active users', 50000] }
export const WARN = 0.8

// Fresh figures for Company Settings; null until migrate-012 runs.
export async function readUsage() {
  const { data, error } = await db().rpc('app_usage')
  if (error) return null
  return Object.entries(LIMITS).map(([k, [label, max]]) => ({ key: k, label, used: Number(data[k]) || 0, max, share: (Number(data[k]) || 0) / max }))
}

// The warning banner on every admin page: checked at most once an hour. A missing migrate-012 is cached too,
// so it costs one call an hour instead of one per page.
const cached = unstable_cache(readUsage, ['usage'], { revalidate: 3600 })
export const getUsage = () => cached().catch(() => null)
