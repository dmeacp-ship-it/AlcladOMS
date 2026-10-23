import { redirect } from 'next/navigation'

// Orders open as a dialog over the list (/orders?view=ID); old /orders/ID links land there.
export default async function OrderPage({ params, searchParams }) {
  const sp = await searchParams
  const extra = new URLSearchParams(Object.entries(sp).filter(([k]) => ['ok', 'error', 'open_batch_pi'].includes(k)))
  redirect(`/orders?view=${(await params).id}${extra.size ? `&${extra}` : ''}`)
}
