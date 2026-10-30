'use client'

import { useRouter } from 'next/navigation'

export default function StoreFilter({ stores, storeId, term, tab }) {
  const router = useRouter()

  return (
    <select
      name="store"
      value={storeId}
      className="tsearch"
      style={{ padding: '6px 10px', fontSize: '0.84rem' }}
      onChange={(e) => {
        const q = new URLSearchParams()
        if (tab && tab !== 'log') q.set('tab', tab)
        if (e.target.value) q.set('store', e.target.value)
        if (term) q.set('q', term)
        const qs = q.toString()
        router.push(`/inventory/adjust${qs ? `?${qs}` : ''}`)
      }}
    >
      <option value="">All Stores</option>
      {stores.map((s) => (
        <option key={s.id} value={String(s.id)}>
          {s.name} ({s.plant_code})
        </option>
      ))}
    </select>
  )
}
