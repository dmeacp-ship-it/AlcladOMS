import { redirect } from 'next/navigation'

export const metadata = { title: 'New Purchase Order' }

export default async function NewPOPage({ searchParams }) {
  const sp = await searchParams
  const q = new URLSearchParams(sp)
  q.set('new', '1')
  redirect(`/inventory/po?${q.toString()}`)
}
