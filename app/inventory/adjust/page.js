import { redirect } from 'next/navigation'

export default async function AdjustRedirect({ searchParams }) {
  const sp = await searchParams
  const q = new URLSearchParams()
  for (const [key, val] of Object.entries(sp || {})) {
    if (val) q.set(key, val)
  }
  const qs = q.toString()
  redirect(`/inventory${qs ? `?${qs}` : ''}`)
}
