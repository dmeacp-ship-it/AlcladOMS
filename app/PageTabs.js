import { IntentLink, LinkBusy } from './ui'

// Pages that share one sidebar link (Production, Stock, Reports) show these tabs at the top. on: the lit tab's href.
const GROUPS = {
  // One row of tabs per area: the shift steps (enter output, then check pieces) are tabs of Production too.
  production: [
    ['/plant', 'Ready to ship', 'ph-truck'],
    ['/production', 'Planning', 'ph-calendar-check'],
    ['/production/dpr', 'Shift output (DPR)', 'ph-clipboard-text'],
    ['/production/qc', 'Check pieces (QC)', 'ph-seal-check'],
  ],
  stock: [
    ['/inventory', 'Raw material', 'ph-warehouse'],
    ['/production/fg', 'Finished goods', 'ph-stack'],
    ['/inventory/issue', 'Issues to line', 'ph-arrows-left-right'],
  ],
  reports: [
    ['/admin/reports', 'Sales', 'ph-chart-bar'],
    ['/production/reports', 'Production', 'ph-chart-line-up'],
  ],
}

export default function PageTabs({ group, on, label }) {
  const tabs = GROUPS[group] || []
  return (
    <nav className="tabs" aria-label={label}>
      {tabs.map(([href, text, icon]) => {
        const isActive = href === on
        return (
          <IntentLink
            key={href}
            href={href}
            className={`tab${isActive ? ' on' : ''}`}
            aria-current={isActive ? 'page' : undefined}
          >
            <LinkBusy />
            <i className={`ph ${icon}`} />
            {text}
          </IntentLink>
        )
      })}
    </nav>
  )
}
