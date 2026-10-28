import { redirect } from 'next/navigation'

// Issues open as a dialog over the list (/inventory/issue?view=ID); old /inventory/issue/ID links land there.
export default async function IssuePage({ params, searchParams }) {
  const sp = await searchParams
  const extra = new URLSearchParams(Object.entries(sp).filter(([k]) => ['ok', 'error'].includes(k)))
  redirect(`/inventory/issue?view=${(await params).id}${extra.size ? `&${extra}` : ''}`)
}
