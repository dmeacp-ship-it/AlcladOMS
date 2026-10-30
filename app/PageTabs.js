import { IntentLink, LinkBusy } from './ui'

// Pages that share one sidebar link (Production, Stock, Reports) show these tabs at the top. on: the lit tab's href.
const GROUPS = {
  production: [
    ['/plant', 'Ready to Ship', 'ph-truck'],
    ['/production', 'Production Planning', 'ph-calendar-check'],
    ['/production/dpr', 'Daily Production Report (DPR)', 'ph-clipboard-text'],
  ],
  stock: [
    ['/inventory', 'Raw Material', 'ph-warehouse'],
    ['/production/fg', 'Finished Goods', 'ph-stack'],
    ['/inventory/bom', 'BOM & Recipes', 'ph-receipt'],
    ['/inventory/adjust', 'Adjustments', 'ph-sliders-horizontal'],
  ],
  shift: [
    ['/production/dpr', '1. Enter production', 'ph-gear-six'],
    ['/production/qc', '2. Check pieces', 'ph-seal-check'],
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
