import Link from 'next/link'
import { LinkBusy } from '../ui'

const TABS = [
  ['', 'Planning', 'ph-calendar-check'],
  ['dpr', 'Production', 'ph-factory'],
  ['qc', 'FG QC', 'ph-seal-check'],
  ['fg', 'FG Stock', 'ph-stack'],
  ['reports', 'Reports', 'ph-chart-bar'],
]

// Sub-navigation of the Production pages (FG side). missing = migrate-017 not run yet.
export default function ProdTabs({ tab, missing }) {
  return (
    <>
      <nav className="tabs" aria-label="Production">
        {TABS.map(([k, label, icon]) => (
          <Link prefetch={false} key={k} href={`/production${k ? `/${k}` : ''}`} className={`tab${k === tab ? ' on' : ''}`} aria-current={k === tab ? 'page' : undefined}>
            <LinkBusy /><i className={`ph ${icon}`} />{label}
          </Link>
        ))}
      </nav>
      {missing && (
        <div className="banner warn" style={{ marginBottom: 16 }}>
          <i className="ph ph-warning" /><span>Production isn't set up yet: run <b>supabase/migrate-017.sql</b> in Supabase → SQL Editor.</span>
        </div>
      )}
    </>
  )
}
