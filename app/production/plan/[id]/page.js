import { redirect } from 'next/navigation'

// Production plans open as a dialog over the planning board (/production?view=ID); old /production/plan/ID links land there.
export default async function PlanPage({ params, searchParams }) {
  const sp = await searchParams
  const extra = new URLSearchParams(Object.entries(sp).filter(([k]) => ['ok', 'error'].includes(k)))
  redirect(`/production?view=${(await params).id}${extra.size ? `&${extra}` : ''}`)
}
