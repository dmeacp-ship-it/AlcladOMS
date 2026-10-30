import { redirect } from 'next/navigation'

export default async function GRNPage({ params, searchParams }) {
  const { id } = await params
  const sp = await searchParams
  const extra = new URLSearchParams(Object.entries(sp).filter(([k]) => ['ok', 'error'].includes(k)))
  redirect(`/inventory/po?view_grn=${id}${extra.size ? `&${extra}` : ''}`)
}
