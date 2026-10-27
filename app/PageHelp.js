// "What is this page for" box at the top of the store and production pages: one plain sentence and, where there is
// something to do, the steps in order. Written for people who don't use computers much.
export const HELP = {
  'rm-stock': { icon: 'ph-warehouse', text: 'How much raw material is in each store and on each production line. A red number means it is below the minimum: order more.' },
  po: {
    icon: 'ph-shopping-cart', text: 'Order raw material from a supplier.',
    steps: ['Press New PO', 'Choose the supplier, the plant and the materials', 'Press Create PO — an admin approves it', 'When the goods arrive, use Receive Goods'],
  },
  grn: {
    icon: 'ph-truck', text: 'Use this when a supplier’s truck arrives. Goods go into stock only after they are checked.',
    steps: ['Press Receive goods and choose the purchase order', 'Type how much arrived and press Save what arrived', 'Check the goods: type what is rejected and why', 'Press Save check — the rest goes into stock'],
  },
  issue: {
    icon: 'ph-arrows-left-right', text: 'Send raw material from the store to a production line.',
    steps: ['Press New issue', 'Choose From store and To line', 'Choose the materials and how much', 'Press Save issue and print the slip for signatures'],
  },
  adjust: {
    icon: 'ph-sliders-horizontal', text: 'Fix the stock when a count shows a difference. Use a minus sign for stock that is missing or damaged.',
    steps: ['Choose the store and write the reason', 'Choose the material and type + or − quantity', 'Press Post adjustment'],
  },
  plan: {
    icon: 'ph-calendar-check', text: 'See what customer orders still need, and plan what a line makes in one shift.',
    steps: ['Check “Make in this plan” for each item', 'Choose the date, shift and line', 'Press Create production plan', 'On the plan: issue raw material, then enter production'],
  },
  dpr: {
    icon: 'ph-gear-six', text: 'At the end of every shift, enter what each line made.',
    steps: ['Press Enter production (or open the plan)', 'Type good and rejected pieces', 'Type the raw material used', 'Press Save production — good pieces then wait to be checked'],
  },
  qc: {
    icon: 'ph-seal-check', text: 'Check new pieces before they go into the finished goods store.',
    steps: ['For each row type Pass, B-grade and Reject — together they must equal the good pieces', 'Write the reason for B-grade or rejected pieces', 'Press Save check — passed pieces go into stock'],
  },
  fg: { icon: 'ph-stack', text: 'Finished pieces in the store, by product and size. “Reserved” pieces are kept for an order; “Free” pieces can be given to any order.' },
  'prod-reports': { icon: 'ph-chart-line-up', text: 'How much each line made, how much was rejected, and how much raw material was used for each M2.' },
}

// missing: the page's migration has not been run yet (admin message).
export default function PageHelp({ page, missing, migration }) {
  const h = HELP[page]
  return (
    <>
      {missing && (
        <div className="banner warn" style={{ marginBottom: 16 }}>
          <i className="ph ph-warning" /><span>This part isn't set up yet: run <b>supabase/{migration}</b> in Supabase → SQL Editor.</span>
        </div>
      )}
      {h && (
        <div className="page-help">
          <i className={`ph ${h.icon} page-help-ic`} aria-hidden="true" />
          <div>
            <p>{h.text}</p>
            {h.steps && <ol>{h.steps.map((s) => <li key={s}>{s}</li>)}</ol>}
          </div>
        </div>
      )}
    </>
  )
}
