import Link from 'next/link'
import { LinkBusy } from '../ui'

const TABS = [
  ['', 'Stock', 'ph-warehouse'],
  ['po', 'Purchase Orders', 'ph-shopping-cart'],
  ['grn', 'GRN & QC', 'ph-seal-check'],
  ['issue', 'Issue / Transfer', 'ph-arrows-left-right'],
  ['adjust', 'Opening & Adjust', 'ph-sliders-horizontal'],
]

// Sub-navigation of the Inventory pages; missing = migrate-015 not run yet.
export default function InvTabs({ tab, missing }) {
  return (
    <>
      <nav className="tabs" aria-label="Inventory">
        {TABS.map(([k, label, icon]) => (
          <Link prefetch={false} key={k} href={`/inventory${k ? `/${k}` : ''}`} className={`tab${k === tab ? ' on' : ''}`} aria-current={k === tab ? 'page' : undefined}>
            <LinkBusy /><i className={`ph ${icon}`} />{label}
          </Link>
        ))}
      </nav>
      {missing && (
        <div className="banner warn" style={{ marginBottom: 16 }}>
          <i className="ph ph-warning" /><span>Inventory isn't set up yet: run <b>supabase/migrate-015.sql</b> in Supabase → SQL Editor, then add Plants, Stores, Materials and Vendors under Settings.</span>
        </div>
      )}
    </>
  )
}
