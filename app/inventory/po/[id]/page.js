import { redirect } from 'next/navigation'

// Purchase orders open as a dialog over the list (/inventory/po?view=ID); old /inventory/po/ID links land there.
export default async function POPage({ params, searchParams }) {
  const sp = await searchParams
  const extra = new URLSearchParams(Object.entries(sp).filter(([k]) => ['ok', 'error'].includes(k)))
  redirect(`/inventory/po?view=${(await params).id}${extra.size ? `&${extra}` : ''}`)
}
