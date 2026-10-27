import PageHelp from '../PageHelp'

// Top of every store page: what it is for (the pages themselves are in the sidebar). missing = migrate-015 not run.
const PAGE = { '': 'rm-stock', po: 'po', grn: 'grn', issue: 'issue', adjust: 'adjust' }
export default function InvTabs({ tab, missing }) {
  return <PageHelp page={PAGE[tab]} missing={missing} migration="migrate-015.sql" />
}
