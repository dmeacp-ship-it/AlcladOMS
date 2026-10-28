import { redirect } from 'next/navigation'

// GRNs open as a dialog over the list (/inventory/grn?view=ID); old /inventory/grn/ID links land there.
export default async function GRNPage({ params, searchParams }) {
  const sp = await searchParams
  const extra = new URLSearchParams(Object.entries(sp).filter(([k]) => ['ok', 'error'].includes(k)))
  redirect(`/inventory/grn?view=${(await params).id}${extra.size ? `&${extra}` : ''}`)
}
