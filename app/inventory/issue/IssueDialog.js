import { storeLabel } from '@/lib/inventory'
import { dmy, qty } from '@/lib/tas'
import { PrintButton, RouteDialog } from '../../ui'
import Slip from '../Slip'

export default function IssueDialog({ issue, s, closeHref }) {
  if (!issue) return null
  issue.items?.sort((a, b) => a.id - b.id)

  const footer = (
    <PrintButton cls="btn btn-primary" />
  )

  return (
    <RouteDialog
      key={issue.id}
      icon="ph-arrows-left-right"
      title={<>Issue {issue.doc_no}</>}
      footer={footer}
      closeHref={closeHref}
    >
      <Slip
        s={s}
        fno="F.NO:-TAS/STR/02"
        title="MATERIAL ISSUE SLIP"
        meta={[
          ['DATE', dmy(issue.doc_date)],
          ['ISSUE NO.', issue.doc_no],
          ['REQUESTED BY', issue.requested_by],
          ['ISSUED BY', issue.by_name],
        ]}
        party={[
          ['FROM', [storeLabel(issue.from)]],
          ['TO', [storeLabel(issue.to)]],
        ]}
        heads={['MATERIAL', 'CODE', 'UOM', 'QTY']}
        rows={issue.items.map((i) => [i.m?.name, i.m?.code, i.m?.uom, qty(i.qty)])}
        notes={issue.notes}
        signs={['Issued By', 'Received By']}
      />
    </RouteDialog>
  )
}
