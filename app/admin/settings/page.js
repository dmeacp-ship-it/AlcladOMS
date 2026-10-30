import { requireRole } from '@/lib/server'
import { getSettings } from '@/lib/settings'
import { invMasters, storeLabel } from '@/lib/inventory'
import { money } from '@/lib/tas'
import { saveSettings } from '../actions'
import { FileDrop, Submit, UnsavedGuard } from '../../ui'
import UsagePanel from './UsagePanel'
import SettingsTabs from './SettingsTabs'

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

  const footerAction = (
    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '12px', marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
      <Submit label="Save settings" icon="ph-check" cls="btn btn-primary btn-md" />
    </div>
  )

  const tabs = [
    {
      id: 'company',
      label: 'Company Profile',
      icon: 'ph-buildings',
      title: 'Company Profile & Entity Details',
      description: 'Official corporate details printed on quotations, delivery orders, and tax invoices.',
      content: (
        <div>
          <div className="fgrid-2">{COMPANY_FIELDS.map(field)}</div>
          {footerAction}
        </div>
      ),
    },
    {
      id: 'bank',
      label: 'Bank Accounts',
      icon: 'ph-bank',
      title: 'Bank Accounts & Wire Details',
      description: 'Settlement accounts and SWIFT wire transfer details printed on quotes and proforma invoices.',
      content: (
        <div>
          <div className="fgrid-2">{BANK_FIELDS.map(field)}</div>
          {footerAction}
        </div>
      ),
    },
    {
      id: 'documents',
      label: 'Documents & Terms',
      icon: 'ph-file-text',
      title: 'Official Letterhead & Document Terms',
      description: 'Header logo image and standard commercial legal terms included on documents.',
      content: (
        <div>
          <div className="fgrid-2">
            <div className="fg full">
              <label>Letterhead Image</label>
              <img src={`/letterhead?v=${s.letterhead_v || 0}`} alt="Current letterhead" className="lh-preview" width={911} height={106} />
              <FileDrop name="letterhead" accept="image/png,image/jpeg,image/webp" hint="PNG, JPG or WebP, max 1 MB · leave empty to keep the current one" required={false} maxMB={1} />
              <label className="check" style={{ marginTop: '8px' }}><input type="checkbox" name="letterhead_reset" />Go back to the original letterhead</label>
            </div>
            <div className="fg full">
              <label htmlFor="quote_terms">Quotation terms <span className="hint">— one per line, numbered on the quotation PDF</span></label>
              <textarea id="quote_terms" name="quote_terms" rows={7} defaultValue={s.quote_terms.join('\n')} style={{ width: '100%', fontFamily: 'inherit' }} />
            </div>
            <div className="fg full">
              <label htmlFor="pi_terms">Proforma invoice remarks <span className="hint">— one per line</span></label>
              <textarea id="pi_terms" name="pi_terms" rows={4} defaultValue={s.pi_terms.join('\n')} style={{ width: '100%', fontFamily: 'inherit' }} />
            </div>
          </div>
          {footerAction}
        </div>
      ),
    },
    {
      id: 'numbering',
      label: 'Numbering & VAT',
      icon: 'ph-hash',
      title: 'VAT Rate & Document Numbering',
      description: 'Standard VAT tax percentage and automated document numbering rules.',
      content: (
        <div>
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
          <div className="cust-meta-hint" style={{ marginTop: '16px' }}>
            <i className="ph ph-info" />
            <span>
              Next numbers look like <b>{s.quote_prefix}-{year}-{String(s.quote_start).padStart(s.quote_digits, '0')}</b> · <b>{s.do_prefix}-CUS-115-241026-01</b> · <b>{s.pi_prefix}-CUS-115-241026-01</b>. Existing document numbers don't change.
            </span>
          </div>
          {footerAction}
        </div>
      ),
    },
    {
      id: 'approvals',
      label: 'Approvals & Stock',
      icon: 'ph-seal-check',
      title: 'Quotation Approvals & Inventory Link',
      description: 'Value thresholds for automated sign-off and Finished Goods store allocation.',
      content: (
        <div>
          <div className="fgrid-2">
            <div className="fg">
              <label htmlFor="auto_approve_below">Auto-approve quotes below (SAR)</label>
              <input id="auto_approve_below" name="auto_approve_below" type="number" min="0" step="0.01" defaultValue={s.auto_approve_below ?? ''} placeholder="Off (disabled)" />
              <span className="hint">Quotes with total value under this amount are automatically approved upon submission.</span>
            </div>
            <div className="fg">
              <label htmlFor="admin_approval_above">Only an admin can approve above (SAR)</label>
              <input id="admin_approval_above" name="admin_approval_above" type="number" min="0" step="0.01" defaultValue={s.admin_approval_above ?? ''} placeholder="Off (disabled)" />
              <span className="hint">High-value quotes exceeding this amount strictly require an administrator to sign off.</span>
            </div>
          </div>
          {(s.auto_approve_below || s.admin_approval_above) && (
            <div className="cust-meta-hint" style={{ marginTop: '12px' }}>
              <i className="ph ph-info" />
              <span>
                {s.auto_approve_below ? `Quotes under SAR ${money(s.auto_approve_below)} are approved on submit. ` : ''}
                {s.admin_approval_above ? `Quotes over SAR ${money(s.admin_approval_above)} wait for an admin.` : ''}
              </span>
            </div>
          )}

          <div style={{ marginTop: '24px', paddingTop: '20px', borderTop: '1px solid var(--border)' }}>
            <h4 style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--text)', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="ph ph-warehouse" />
              Finished Goods Store Integration
            </h4>
            <div className="fgrid-2">
              <div className="fg">
                <label htmlFor="fg_store">FG store orders ship from</label>
                <select id="fg_store" name="fg_store" defaultValue={s.fg_store || ''}>
                  <option value="">Not set</option>
                  {fgStores.map((x) => <option key={x.id} value={x.code}>{storeLabel(x)}</option>)}
                </select>
                <span className="hint">Production Floor and planning board display stock from this store; a DO deducts pieces from it.</span>
              </div>
              <div className="fg" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label className="row" style={{ gap: '8px', fontWeight: 500 }}><input type="checkbox" name="fg_link" defaultChecked={s.fg_link} /> Orders use FG stock</label>
                  <span className="hint" style={{ display: 'block', marginTop: '2px', paddingLeft: '24px' }}>
                    Mark ready only reserves pieces that are free in FG stock, and a Delivery Order takes them out.
                  </span>
                </div>
                <div>
                  <label className="row" style={{ gap: '8px', fontWeight: 500 }}><input type="checkbox" name="fg_auto_reserve" defaultChecked={s.fg_auto_reserve} /> Reserve new FG for oldest orders automatically</label>
                  <span className="hint" style={{ display: 'block', marginTop: '2px', paddingLeft: '24px' }}>
                    After pieces pass FG QC, automatically mark them ready on the oldest pending approved orders.
                  </span>
                </div>
              </div>
            </div>
          </div>
          {footerAction}
        </div>
      ),
    },
    {
      id: 'usage',
      label: 'System Usage',
      icon: 'ph-gauge',
      title: 'Database & Storage Usage Quota',
      description: 'Live cloud capacity, file storage usage, and monthly active user stats.',
      content: (
        <div>
          <UsagePanel />
        </div>
      ),
    },
  ]

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <form action={saveSettings}>
        <UnsavedGuard />

        <div className="tbl-top" style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h2 className="tbl-ttl" style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="ph ph-gear" />
              Company Settings
            </h2>
            <span className="muted text-sm" style={{ display: 'block', marginTop: '2px' }}>
              Company profile, bank details, documents, VAT & numbering
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
            {s.updated_by && (
              <span className="muted text-xs">
                Last saved by <b>{s.updated_by}</b> · {new Date(s.updated_at).toLocaleString('en-GB', { timeZone: 'Asia/Riyadh', dateStyle: 'medium', timeStyle: 'short' })}
              </span>
            )}
          </div>
        </div>

        <SettingsTabs tabs={tabs} defaultTab="company" />
      </form>
    </div>
  )
}
