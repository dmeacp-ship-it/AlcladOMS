import Link from 'next/link'
import { LinkBusy } from './ui'

// Pages that share one sidebar link (Stock, Record Shift, Reports) show these tabs at the top. on: the lit tab's href.
const GROUPS = {
  stock: [['/inventory', 'Raw material', 'ph-warehouse'], ['/production/fg', 'Finished goods', 'ph-stack']],
  shift: [['/production/dpr', '1. Enter production', 'ph-gear-six'], ['/production/qc', '2. Check pieces', 'ph-seal-check']],
  reports: [['/admin/reports', 'Sales', 'ph-chart-bar'], ['/production/reports', 'Production', 'ph-chart-line-up']],
}

export default function PageTabs({ group, on, label }) {
  return (
    <nav className="tabs" aria-label={label}>
      {GROUPS[group].map(([href, text, icon]) => (
        <Link prefetch={false} key={href} href={href} className={`tab${href === on ? ' on' : ''}`} aria-current={href === on ? 'page' : undefined}>
          <LinkBusy /><i className={`ph ${icon}`} />{text}
        </Link>
      ))}
    </nav>
  )
}
