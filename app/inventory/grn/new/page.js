import { redirect } from 'next/navigation'

export const metadata = { title: 'Receive Goods' }

export default async function NewGRNPage({ searchParams }) {
  const sp = await searchParams
  redirect(`/inventory/po?receive=${sp.po || '1'}`)
}
