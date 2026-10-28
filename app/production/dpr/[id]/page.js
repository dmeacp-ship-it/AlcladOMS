import { redirect } from 'next/navigation'

// Production entries open as a dialog over the list (/production/dpr?view=ID); old /production/dpr/ID links land there.
export default async function DprPage({ params, searchParams }) {
  const sp = await searchParams
  const extra = new URLSearchParams(Object.entries(sp).filter(([k]) => ['ok', 'error'].includes(k)))
  redirect(`/production/dpr?view=${(await params).id}${extra.size ? `&${extra}` : ''}`)
}
