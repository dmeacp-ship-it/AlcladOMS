import { COMPANY, dmy, int, money, round2, totals } from '@/lib/tas'

// Printable Quotation / Delivery Order / Proforma Invoice in the "TAS sales format.xlsx" layout.
const TERMS = [
  'Tas International Manufacturing Company shall exempt from any responsibilities of loss if customers pay any cash or transfer any fund to any individuals without TAS  approval.',
  'Mode of payment (MoP), Cash on delivery / Bank Account Transfer',
  '30% Payment in Advance (PIA) & 70% Before Delivery (CBD).',
  'Payment will be effected according to the conditions set up in the Proforma Invoice, unless any changes were agreed with the customer in written.',
  'The amount should be paid to our bank account mentioned in the Proforma Invoice, on or before due time.',
  'All orders are subject to quotation on the basis of a Proforma Invoice for subsequent confirmation by the customer in writing. No order will be entered for production and/or delivered until reception of the confirmation of said Proforma Invoice in writing and receiveing of advance payment as agreed in this proforma invoice, unless otherwise specified.',
  'The Purchaser shall not for any reason, with hold payment or make any deduction or set off from the Price until unless agreed in writting with Tas International Manufacturing Company.',
  'In general, no modification, amendment, waiver or other changes of any of these Terms and Conditions, or of any of the Seller’s rights or remedies thereunder, shall be binding on Seller unless expressly accepted in writing by Seller’s authorized officers.',
]

const DOCS = {
  quote: { fno: 'F.NO:-TAS/SALE/01', label: 'QUOTATION NO.', title: 'QUOTATION', to: 'QUOTE TO', min: 11 },
  do: { fno: 'F.NO:-TAS/SALE/04', label: 'DELIVERY ORDER NO.', title: 'DELIVERY ORDER', to: 'DELIVERING TO', min: 14 },
  pi: { fno: 'F.NO:-TAS/SALE/02', label: 'PROFORMA INVOICE NO.', title: 'PROFORMA INVOICE', to: 'BILL TO', min: 12 },
}

export const docReady = (doc, o, batch) => {
  if (doc === 'quote') return true
  if (doc === 'do') return !!batch?.do_date || !!o.do_date || (o.batches || []).some((b) => b.do_date)
  if (doc === 'pi') return !!batch?.pi_date || !!o.pi_date || (o.batches || []).some((b) => b.pi_date)
  return false
}

export default function Doc({ doc, o, batch }) {
  const d = DOCS[doc]
  const isDO = doc === 'do'

  let date = { quote: o.quote_date, do: o.do_date, pi: o.pi_date }[doc]
  let no = doc === 'quote' ? o.quote_no : o.doc_no
  let transport = o.transport

  if (batch) {
    if (doc === 'do') {
      date = batch.do_date || date
      no = batch.do_no || no
    } else if (doc === 'pi') {
      date = batch.pi_date || date
      no = batch.pi_no || no
      transport = batch.transport != null ? batch.transport : transport
    }
  }

  // Quotation shows quoted lines; DO shows batch dispatched items; PI shows batch invoiced items.
  let lines = []
  if (doc === 'quote') {
    lines = o.items.map((i) => ({ desc: i.description, a: int(i.qty), b: money(i.m2), c: money(i.price), d: money(i.total), total: i.total }))
  } else if (isDO) {
    if (batch?.items?.length) {
      lines = batch.items.map((bi) => {
        const item = bi.order_item || o.items.find((it) => it.id === bi.order_item_id) || {}
        return {
          desc: item.description || '',
          a: int(item.width),
          b: int(item.length),
          c: int(bi.do_qty),
          d: money(bi.do_m2),
          pcs: +bi.do_qty,
          m2: +bi.do_m2,
        }
      })
    } else {
      lines = o.items.filter((i) => i.delivered_qty > 0).map((i) => ({
        desc: i.description, a: int(i.width), b: int(i.length), c: int(i.delivered_qty), d: money(i.delivered_m2), pcs: +i.delivered_qty, m2: +i.delivered_m2,
      }))
    }
  } else if (doc === 'pi') {
    if (batch?.items?.length) {
      lines = batch.items.map((bi) => {
        const item = bi.order_item || o.items.find((it) => it.id === bi.order_item_id) || {}
        const qty = bi.invoiced_qty ?? bi.do_qty
        const m2 = bi.invoiced_m2 ?? bi.do_m2
        const price = bi.invoiced_price ?? item.price
        const total = bi.invoiced_total ?? (m2 * price)
        return {
          desc: item.description || '',
          a: int(qty),
          b: money(m2),
          c: money(price),
          d: money(total),
          total: total,
        }
      })
    } else {
      lines = o.items.filter((i) => i.invoiced_qty > 0).map((i) => ({
        desc: i.description, a: int(i.invoiced_qty), b: money(i.invoiced_m2), c: money(i.invoiced_price), d: money(i.invoiced_total), total: i.invoiced_total,
      }))
    }
  }

  const blanks = Math.max(0, d.min - lines.length)
  const t = totals(lines, transport)
  const heads = isDO
    ? ['DESCRIPTION', 'WIDTH', 'LENGTH', 'Quantity (Pcs)', 'Quantity (m2)']
    : ['DESCRIPTION', 'QTY (PCS)', 'QTY (M2)', 'UNIT PRICE', 'TOTAL']

  return (
    <div className="doc">
      <img className="lh" src="/letterhead.png" alt="" />
      <div className="fno">{d.fno}</div>
      <div className="head">
        <div className="company">
          <div className="big">{COMPANY.NAME}</div>
          <div>{COMPANY.ADDRESS}</div>
          <div>CR NO:- {COMPANY.CR_NO}</div>
          <div>VAT: {COMPANY.VAT_NO}</div>
        </div>
        <dl className="meta">
          <dt>DATE</dt><dd>{dmy(date)}</dd>
          <dt>{d.label}</dt><dd>{no}</dd>
          <dt>SALESPERSON</dt><dd>{o.salesperson_name}</dd>
          <dt>PAGE</dt><dd>01 of 01</dd>
        </dl>
      </div>
      <h1 className={`title ${doc}`}>{d.title}</h1>

      <div className="party">
        <div>
          <div className="label">{d.to}</div>
          <div>CUSTOMER NAME:-&nbsp;&nbsp; <bdi>{o.customer_name}</bdi></div>
          <div className="addr">CUSTOMER ADDRESS:-&nbsp;&nbsp; {o.address}</div>
          <div>CR NO:-&nbsp;&nbsp; {o.cr_no}</div>
          <div>VAT NO:-&nbsp;&nbsp; {o.vat_no}</div>
          <div>CONTACT NO:-&nbsp;&nbsp; {o.contact_no}</div>
        </div>
        {doc === 'pi' && (
          <div>
            <div className="label">SHIP TO</div>
            <div><bdi>{o.customer_name}</bdi></div>
            <div className="addr">{o.address}</div>
            <div>&nbsp;</div><div>&nbsp;</div>
            <div>CONTACT NO:-&nbsp;&nbsp; {o.contact_no}</div>
          </div>
        )}
      </div>

      <table className={`items ${isDO ? 'dn' : ''}`}>
        <colgroup><col className="c1" /><col className="c2" /><col className="c3" /><col className="c4" /><col className="c5" /></colgroup>
        <thead><tr>{heads.map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}><td>{l.desc}</td><td>{l.a}</td><td>{l.b}</td><td>{l.c}</td><td>{l.d}</td></tr>
          ))}
          {Array.from({ length: blanks }, (_, i) => (
            <tr key={`b${i}`}><td /><td /><td /><td /><td /></tr>
          ))}
        </tbody>
        {isDO && (
          <tfoot>
            <tr>
              <th colSpan={3}>SUBTOTAL</th>
              <td>{int(lines.reduce((s, l) => s + l.pcs, 0))}</td>
              <td>{money(round2(lines.reduce((s, l) => s + l.m2, 0)))}</td>
            </tr>
          </tfoot>
        )}
      </table>

      {!isDO && (
        <table className="sums">
          <tbody>
            <tr><th>SUBTOTAL</th><td>{money(t.subtotal)}</td></tr>
            <tr><th>TRANSPORT</th><td>{money(t.transport)}</td></tr>
            <tr><th>VAT (15%)</th><td>{money(t.vat)}</td></tr>
            <tr className="grand"><th>TOTAL (SAR)</th><td>SAR {money(t.total)}</td></tr>
          </tbody>
        </table>
      )}

      {doc === 'quote' && (
        <>
          <div className="terms">
            Remarks / Payment Instructions:
            {TERMS.map((x, i) => <div key={i}>{i + 1}. {x}</div>)}
          </div>
          <div className="sign">
            <div>
              <div>For Seller,</div>
              <div>{COMPANY.NAME}</div>
              <div>Beneficiary Account No.(SAR):- {COMPANY.BANK_ACC}</div>
              <div>IBAN NO.:- {COMPANY.IBAN}</div>
            </div>
            <div className="tall">Quotation Accepted By<br /><br />Name:<br /><br />Signature:<br /><br />Stamp:</div>
          </div>
        </>
      )}

      {isDO && (
        <div className="sign">
          <div className="low">DELIVERED BY<br />{COMPANY.NAME}</div>
          <div className="tall">Received&nbsp; By<br /><br />Name:<br /><br />Signature:<br /><br />Mobile no:-</div>
        </div>
      )}

      {doc === 'pi' && (
        <div className="terms">
          <i>REMARKS / PAYMENT INSTRUCTIONS:</i>
          <div>* Tas International Manufacturing Company shall exempt from any responsibilities of loss if customers pay any cash or transfer any fund to any individuals without Tas  approval.</div>
          <div>* The amount should be paid to our bank account mentioned in the below before delivery.</div>
          <br />
          <i>BANK ACCOUNT INFORMATION:</i>
          <div>Beneficiary Bank Name:&nbsp; <b>{COMPANY.BANK_NAME}</b></div>
          <div>Swift Code: <b>{COMPANY.SWIFT}</b></div>
          <div>Beneficiary Account Name: <b>{COMPANY.NAME}</b></div>
          <div>Beneficiary Account No.(SAR):- <b>{COMPANY.BANK_ACC}</b></div>
          <div>IBAN NO.:- <b>{COMPANY.IBAN}</b></div>
          <br />
          <div>Beneficiary Account No.(USD):- <b>{COMPANY.BANK_ACC_USD}</b></div>
          <div>IBAN NO.:- <b>{COMPANY.IBAN_USD}</b></div>
        </div>
      )}

      <footer>
        {COMPANY.ADDRESS}
        <br />
        Helpline No: {COMPANY.HELPLINE} | Email: {COMPANY.EMAIL}
      </footer>
    </div>
  )
}
