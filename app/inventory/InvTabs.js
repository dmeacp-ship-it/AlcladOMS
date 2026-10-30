import PageHelp from '../PageHelp'
import PageTabs from '../PageTabs'

// Top of every store page: Stock tabs where the page is part of Stock & Warehouse, then what the page is for.
// missing = migrate-015 not run.
const PAGE = { '': 'rm-stock', po: 'po', grn: 'grn', issue: 'issue' }
const STOCK_ON = { '': '/inventory', issue: '/inventory/issue' }

export default function InvTabs({ tab, missing }) {
  const stockTab = STOCK_ON[tab]
  return (
    <>
      {stockTab && <PageTabs group="stock" on={stockTab} label="Inventory" />}
      {tab !== '' && <PageHelp page={PAGE[tab]} missing={missing} migration="migrate-015.sql" />}
    </>
  )
}
