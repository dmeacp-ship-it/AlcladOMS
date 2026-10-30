import PageHelp from '../PageHelp'
import PageTabs from '../PageTabs'

// Top of every production page: the tabs of the sidebar link it shares (Production, Stock, Reports), then what the
// page is for. missing = migrate-017 not run.
const PAGE = { '': 'plan', dpr: 'dpr', qc: 'qc', fg: 'fg', reports: 'prod-reports' }
const PROD_ON = { '': '/production', dpr: '/production/dpr', qc: '/production/dpr' }

export default function ProdTabs({ tab, missing }) {
  if (tab === 'fg') {
    return (
      <>
        <div className="tabs-bar">
          <PageTabs group="stock" on="/production/fg" label="Inventory" />
        </div>
        <PageHelp page={PAGE[tab]} missing={missing} migration="migrate-017.sql" />
      </>
    )
  }
  if (tab === 'reports') {
    return (
      <>
        <div className="tabs-bar">
          <PageTabs group="reports" on="/production/reports" label="Reports" />
        </div>
        <PageHelp page={PAGE[tab]} missing={missing} migration="migrate-017.sql" />
      </>
    )
  }
  const hasShift = tab === 'dpr' || tab === 'qc'
  return (
    <>
      <div className="tabs-bar">
        <PageTabs group="production" on={PROD_ON[tab] || '/production'} label="Production" />
        {hasShift && (
          <PageTabs group="shift" on={tab === 'dpr' ? '/production/dpr' : '/production/qc'} label="Record shift" />
        )}
      </div>
      <PageHelp page={PAGE[tab]} missing={missing} migration="migrate-017.sql" />
    </>
  )
}
