import PageHelp from '../PageHelp'
import PageTabs from '../PageTabs'

// Top of every production page: the tabs of the sidebar link it shares (Stock, Record Shift, Reports), then what the
// page is for. missing = migrate-017 not run.
const PAGE = { '': 'plan', dpr: 'dpr', qc: 'qc', fg: 'fg', reports: 'prod-reports' }
const TABS = { dpr: ['shift', '/production/dpr', 'Record shift'], qc: ['shift', '/production/qc', 'Record shift'], fg: ['stock', '/production/fg', 'Stock'], reports: ['reports', '/production/reports', 'Reports'] }
export default function ProdTabs({ tab, missing }) {
  const t = TABS[tab]
  return (
    <>
      {t && <PageTabs group={t[0]} on={t[1]} label={t[2]} />}
      <PageHelp page={PAGE[tab]} missing={missing} migration="migrate-017.sql" />
    </>
  )
}
