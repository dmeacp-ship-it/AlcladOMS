import { requireRole } from '@/lib/server'
import { getSettings } from '@/lib/settings'
import { invMasters, storeLabel } from '@/lib/inventory'
import { money } from '@/lib/tas'
import { saveSettings } from '../actions'
import { FileDrop, Submit, UnsavedGuard } from '../../ui'
import UsagePanel from './UsagePanel'

export const metadata = { title: 'Company Settings' }

const COMPANY_FIELDS = [
  ['NAME', 'Company name', 'full'], ['ADDRESS', 'Address', 'full'], ['CR_NO', 'CR no'], ['VAT_NO', 'VAT no'],
  ['HELPLINE', 'Helpline'], ['EMAIL', 'Email'],
]
const BANK_FIELDS = [
  ['BANK_NAME', 'Bank name'], ['SWIFT', 'SWIFT code'], ['BANK_ACC', 'Account no (SAR)'], ['IBAN', 'IBAN (SAR)'],
  ['BANK_ACC_USD', 'Account no (USD)'], ['IBAN_USD', 'IBAN (USD)'],
]

// Company, documents, VAT, number formats and approval rules. Everything here is read by the
// printable documents and the order actions, so a change applies without a redeploy.
export default async function Settings() {
  await requireRole('admin')
  const [s, { stores }] = await Promise.all([getSettings(), invMasters()])
  const fgStores = stores.filter((x) => x.type === 'FG')
  const year = new Date().getFullYear()
  const field = ([k, label, span]) => (
    <div className={`fg${span ? ` ${span}` : ''}`} key={k}>
      <label htmlFor={`c-${k}`}>{label}{k === 'NAME' && <span className="req"> *</span>}</label>
      <input id={`c-${k}`} name={`company_${k}`} defaultValue={s.company[k] || ''} required={k === 'NAME'} />
    </div>
  )
  const prefix = (name, label) => (
    <div className="fg">
      <label htmlFor={name}>{label} <span className="req">*</span></label>
      <input id={name} name={name} defaultValue={s[name]} required maxLength={6} pattern="[A-Za-z0-9]{1,6}" style={{ textTransform: 'uppercase' }} />
    </div>
  )

  return (
    <form action={saveSettings}>
      <UnsavedGuard />
      <UsagePanel />
      <section className="fsec">
        <h2 className="fsec-ttl"><i className="ph ph-buildings" />Company</h2>
        <div className="fgrid-2">{COMPANY_FIELDS.map(field)}</div>
      </section>

      <section className="fsec">
        <h2 className="fsec-ttl"><i className="ph ph-bank" />Bank account (printed on quotes and PIs)</h2>
        <div className="fgrid-2">{BANK_FIELDS.map(field)}</div>
      </section>

      <section className="fsec">
        <h2 className="fsec-ttl"><i className="ph ph-file-text" />Documents</h2>
        <div className="fgrid-2">
          <div className="fg full">
            <label>Letterhead</label>
            <img src={`/letterhead?v=${s.letterhead_v || 0}`} alt="Current letterhead" className="lh-preview" width={911} height={106} />
            <FileDrop name="letterhead" accept="image/png,image/jpeg,image/webp" hint="PNG, JPG or WebP, max 1 MB · leave empty to keep the current one" required={false} maxMB={1} />
            <label className="check"><input type="checkbox" name="letterhead_reset" />Go back to the original letterhead</label>
          </div>
          <div className="fg full">
            <label htmlFor="quote_terms">Quotation terms <span className="hint">— one per line, numbered on the quote</span></label>
            <textarea id="quote_terms" name="quote_terms" rows={8} defaultValue={s.quote_terms.join('\n')} />
          </div>
          <div className="fg full">
            <label htmlFor="pi_terms">Proforma invoice remarks <span className="hint">— one per line</span></label>
            <textarea id="pi_terms" name="pi_terms" rows={3} defaultValue={s.pi_terms.join('\n')} />
          </div>
        </div>
      </section>

      <section className="fsec">
        <h2 className="fsec-ttl"><i className="ph ph-hash" />VAT and number formats</h2>
        <div className="fgrid-3">
          <div className="fg">
            <label htmlFor="vat_pct">VAT % <span className="req">*</span></label>
            <input id="vat_pct" name="vat_pct" type="number" min="0" max="100" step="0.01" defaultValue={s.vat_pct} required />
            <span className="hint">New quotes only. Existing orders keep the rate they were quoted with.</span>
          </div>
          {prefix('quote_prefix', 'Quote prefix')}
          <div className="fg">
            <label htmlFor="quote_digits">Quote number digits <span className="req">*</span></label>
            <input id="quote_digits" name="quote_digits" type="number" min="2" max="6" step="1" defaultValue={s.quote_digits} required />
          </div>
          <div className="fg">
            <label htmlFor="quote_start">Quote starting number <span className="req">*</span></label>
            <input id="quote_start" name="quote_start" type="number" min="1" step="1" defaultValue={s.quote_start} required />
            <span className="hint">Used when it's higher than the last number this year.</span>
          </div>
          {prefix('do_prefix', 'Delivery Order prefix')}
          {prefix('pi_prefix', 'Proforma Invoice prefix')}
        </div>
        <div className="cust-meta-hint">
          <i className="ph ph-info" />
          Next numbers look like {s.quote_prefix}-{year}-{String(s.quote_start).padStart(s.quote_digits, '0')} ·
          {' '}{s.do_prefix}-CUS-115-241026-01 · {s.pi_prefix}-CUS-115-241026-01. Numbers already issued don't change.
        </div>
      </section>

      <section className="fsec">
        <h2 className="fsec-ttl"><i className="ph ph-seal-check" />Approval rules <span className="hint">totals include VAT; leave blank to turn a rule off</span></h2>
        <div className="fgrid-2">
          <div className="fg">
            <label htmlFor="auto_approve_below">Auto-approve quotes below (SAR)</label>
            <input id="auto_approve_below" name="auto_approve_below" type="number" min="0" step="0.01" defaultValue={s.auto_approve_below ?? ''} placeholder="Off" />
          </div>
          <div className="fg">
            <label htmlFor="admin_approval_above">Only an admin can approve above (SAR)</label>
            <input id="admin_approval_above" name="admin_approval_above" type="number" min="0" step="0.01" defaultValue={s.admin_approval_above ?? ''} placeholder="Off" />
          </div>
        </div>
        {(s.auto_approve_below || s.admin_approval_above) && (
          <div className="cust-meta-hint"><i className="ph ph-info" />
            {s.auto_approve_below ? `Quotes under SAR ${money(s.auto_approve_below)} are approved on submit. ` : ''}
            {s.admin_approval_above ? `Quotes over SAR ${money(s.admin_approval_above)} wait for an admin.` : ''}
          </div>
        )}
      </section>

      <section className="fsec">
        <h2 className="fsec-ttl"><i className="ph ph-stack" />Inventory: orders and FG stock</h2>
        <div className="fgrid-2">
          <div className="fg">
            <label htmlFor="fg_store">FG store orders ship from</label>
            <select id="fg_store" name="fg_store" defaultValue={s.fg_store || ''}>
              <option value="">Not set</option>
              {fgStores.map((x) => <option key={x.id} value={x.code}>{storeLabel(x)}</option>)}
            </select>
            <span className="hint">Plant Dispatch and the planning board show its stock; with the option below, a DO takes the pieces out of it.</span>
          </div>
          <div className="fg">
            <label className="row" style={{ gap: 8 }}><input type="checkbox" name="fg_link" defaultChecked={s.fg_link} />Orders use FG stock</label>
            <span className="hint">On: Mark ready can only reserve pieces that are free in FG stock, and a DO takes them out (undo puts them back). Turn it on once the FG opening stock is loaded.</span>
            <label className="row" style={{ gap: 8, marginTop: 10 }}><input type="checkbox" name="fg_auto_reserve" defaultChecked={s.fg_auto_reserve} />Reserve new FG for the oldest orders automatically</label>
            <span className="hint">After FG QC or an opening load, free pieces are marked ready on the oldest approved orders first. Off: the plant marks ready by hand.</span>
          </div>
        </div>
      </section>

      {/* Sticks to the bottom of the window, so Save is always one click away on this long form */}
      <div className="row save-bar">
        {s.updated_by && <span className="muted text-sm">Last saved by {s.updated_by}, {new Date(s.updated_at).toLocaleString('en-GB', { timeZone: 'Asia/Riyadh', dateStyle: 'medium', timeStyle: 'short' })}</span>}
        <Submit label="Save settings" icon="ph-check" cls="btn btn-primary btn-lg" />
      </div>
    </form>
  )
}
