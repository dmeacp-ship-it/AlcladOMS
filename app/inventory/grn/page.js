import { redirect } from 'next/navigation'

export async function generateMetadata({ searchParams }) {
  const sp = await searchParams
  if (sp.new || sp.po) return { title: 'Receive Goods' }
  return { title: 'Goods Received (GRN)' }
}

export default async function GRNList({ searchParams }) {
  const sp = await searchParams
  const params = new URLSearchParams()
  params.set('tab', 'grn')
  if (sp.view) params.set('view_grn', sp.view)
  if (sp.new || sp.po) params.set('receive', sp.po || '1')
  if (sp.show) params.set('show', sp.show)
  if (sp.q) params.set('q', sp.q)
  if (sp.ok) params.set('ok', sp.ok)
  if (sp.error) params.set('error', sp.error)
  redirect(`/inventory/po?${params.toString()}`)
}
