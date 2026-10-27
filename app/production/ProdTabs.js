import PageHelp from '../PageHelp'

// Top of every production page: what it is for (the pages themselves are in the sidebar). missing = migrate-017 not run.
const PAGE = { '': 'plan', dpr: 'dpr', qc: 'qc', fg: 'fg', reports: 'prod-reports' }
export default function ProdTabs({ tab, missing }) {
  return <PageHelp page={PAGE[tab]} missing={missing} migration="migrate-017.sql" />
}
