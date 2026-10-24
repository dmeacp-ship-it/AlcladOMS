// Admin-editable settings (app_settings row, migrate-008). Anything not saved yet falls back to these defaults,
// which are the values the app shipped with, so nothing changes until an admin edits them.
import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { db } from './server'
import { COMPANY, VAT_RATE } from './tas'

export const DEFAULTS = {
  company: COMPANY,
  quote_terms: [
    'Tas International Manufacturing Company shall exempt from any responsibilities of loss if customers pay any cash or transfer any fund to any individuals without TAS  approval.',
    'Mode of payment (MoP), Cash on delivery / Bank Account Transfer',
    '30% Payment in Advance (PIA) & 70% Before Delivery (CBD).',
    'Payment will be effected according to the conditions set up in the Proforma Invoice, unless any changes were agreed with the customer in written.',
    'The amount should be paid to our bank account mentioned in the Proforma Invoice, on or before due time.',
    'All orders are subject to quotation on the basis of a Proforma Invoice for subsequent confirmation by the customer in writing. No order will be entered for production and/or delivered until reception of the confirmation of said Proforma Invoice in writing and receiveing of advance payment as agreed in this proforma invoice, unless otherwise specified.',
    'The Purchaser shall not for any reason, with hold payment or make any deduction or set off from the Price until unless agreed in writting with Tas International Manufacturing Company.',
    'In general, no modification, amendment, waiver or other changes of any of these Terms and Conditions, or of any of the Seller’s rights or remedies thereunder, shall be binding on Seller unless expressly accepted in writing by Seller’s authorized officers.',
  ],
  pi_terms: [
    'Tas International Manufacturing Company shall exempt from any responsibilities of loss if customers pay any cash or transfer any fund to any individuals without Tas  approval.',
    'The amount should be paid to our bank account mentioned in the below before delivery.',
  ],
  vat_pct: VAT_RATE * 100,
  quote_prefix: 'Q',
  quote_digits: 3,
  quote_start: 1,
  do_prefix: 'DO',
  pi_prefix: 'PI',
  auto_approve_below: null, // SAR incl. VAT; quotes below it are approved on submit
  admin_approval_above: null, // SAR incl. VAT; quotes above it need an admin to approve
}

// Kept in Next's data cache until an admin saves anything (updateTag('masters') in app/admin/actions.js).
// One read per request. Before migrate-008 runs the table is missing and the defaults are used.
export const getSettings = cache(unstable_cache(async () => {
  const { data } = await db().from('app_settings').select('data, updated_at, updated_by').eq('id', 1).maybeSingle()
  const s = data?.data || {}
  return { ...DEFAULTS, ...s, company: { ...DEFAULTS.company, ...s.company }, updated_at: data?.updated_at, updated_by: data?.updated_by }
}, ['settings'], { tags: ['masters'] }))
