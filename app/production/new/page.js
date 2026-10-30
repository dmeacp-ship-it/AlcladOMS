import { redirect } from 'next/navigation'

export const metadata = { title: 'New Production Plan' }

export default async function NewPlanPage({ searchParams }) {
  const sp = await searchParams
  const q = new URLSearchParams(sp)
  q.set('new', '1')
  redirect(`/production?${q.toString()}`)
}
