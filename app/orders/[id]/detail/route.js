import { findOrder, orderHistory, requireRole } from '@/lib/server'

// The order dialog's details and history, as a plain GET. A Server Action here held up the dialog
// opening and closing for seconds on a cold function (router updates wait behind running actions).
export async function GET(_req, { params }) {
  const { id } = await params
  const me = await requireRole()
  const [o, history] = await Promise.all([findOrder(id, me), orderHistory(id)])
  if (!o) return Response.json(null, { status: 404 })
  return Response.json({ order: o, history: history || { dispatches: [], events: [] } }, { headers: { 'Cache-Control': 'no-store' } })
}
