import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="empty">
      <i className="ph ph-magnifying-glass" />
      <h3>Not found</h3>
      <p>This page or order doesn't exist, or you don't have access to it.</p>
      <Link prefetch={false} href="/orders" className="btn btn-primary btn-sm"><i className="ph ph-arrow-left" />Back to Orders</Link>
    </div>
  )
}
