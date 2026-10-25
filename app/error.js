'use client'
import Link from 'next/link'
import { useEffect } from 'react'

// Something failed while loading a page: say so in plain words and offer a way on.
export default function PageError({ error, reset }) {
  useEffect(() => { console.error(error) }, [error])
  return (
    <div className="empty" role="alert">
      <i className="ph ph-warning-circle" />
      <h3>This page couldn't load</h3>
      <p>Check the connection and try again. If it keeps happening, tell the admin{error?.digest ? ` (reference ${error.digest})` : ''}.</p>
      <div className="row" style={{ justifyContent: 'center' }}>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => reset()}><i className="ph ph-arrow-clockwise" />Try again</button>
        <Link prefetch={false} href="/orders" className="btn btn-ghost btn-sm"><i className="ph ph-arrow-left" />Back to Orders</Link>
      </div>
    </div>
  )
}
