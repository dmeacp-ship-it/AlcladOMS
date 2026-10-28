import PageHelp from '../PageHelp'
import PageTabs from '../PageTabs'

// Top of every store page: Stock tabs where the page is part of Stock, then what the page is for.
// missing = migrate-015 not run.
const PAGE = { '': 'rm-stock', po: 'po', grn: 'grn', issue: 'issue', adjust: 'adjust' }
export default function InvTabs({ tab, missing }) {
  return (
    <>
      {(tab === '' || tab === 'adjust') && <PageTabs group="stock" on="/inventory" label="Stock" />}
      <PageHelp page={PAGE[tab]} missing={missing} migration="migrate-015.sql" />
    </>
  )
}
