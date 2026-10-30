import Link from 'next/link'
import { db, requireRole } from '@/lib/server'
import { invMasters, storeLabel } from '@/lib/inventory'
import { day, qty, today } from '@/lib/tas'
import { Combobox, FileDrop, IntentLink, LinkBusy, Modal, ModalFoot } from '../../ui'
import { importOpening, postAdjustment } from '../actions'
import InvTabs from '../InvTabs'
import LinesForm from '../LinesForm'
import StoreFilter from './StoreFilter'

export const metadata = { title: 'Stock Correction' }

export default async function Adjust({ searchParams }) {
  const sp = await searchParams
  const subview = sp.tab === 'form' ? 'form' : 'log'
  const storeId = sp.store || ''
  const term = String(sp.q || '').trim().toLowerCase()

  const [, { missing, stores, materials }, { data: recent }] = await Promise.all([
    requireRole('manager'),
    invMasters(),
    db()
      .from('stock_moves')
      .select('*, store:stores(name, plant_code), m:materials(code, name, uom)')
      .in('ref_type', ['OPENING', 'ADJUST'])
      .order('id', { ascending: false })
      .limit(200),
  ])

  // Filter adjustment logs
  let rows = recent || []
  if (storeId) {
    rows = rows.filter((r) => String(r.store_id) === String(storeId))
  }
  if (term) {
    rows = rows.filter(
      (r) =>
        r.ref_no?.toLowerCase().includes(term) ||
        r.m?.name?.toLowerCase().includes(term) ||
        r.m?.code?.toLowerCase().includes(term) ||
        r.note?.toLowerCase().includes(term) ||
        r.by_name?.toLowerCase().includes(term) ||
        r.store?.name?.toLowerCase().includes(term)
    )
  }

  const baseHref = (p) => {
    const q = new URLSearchParams()
    if (p.tab && p.tab !== 'log') q.set('tab', p.tab)
    if (p.store) q.set('store', p.store)
    if (p.q) q.set('q', p.q)
    const qs = q.toString()
    return `/inventory/adjust${qs ? `?${qs}` : ''}`
  }

  return (
    <>
      <InvTabs tab="adjust" missing={missing} />

      <div className="card">
        {/* ── Unified Card Header Toolbar (Proposal 1) ── */}
        <div className="tbl-top">
          <nav className="tabs tabs-dynamic" aria-label="Adjustment views" style={{ marginBottom: 0 }}>
            <IntentLink
              href={baseHref({ tab: 'log', store: storeId, q: term })}
              className={`tab${subview === 'log' ? ' on' : ''}`}
              title={`Adjustment & Opening Log (${(recent || []).length})`}
            >
              <LinkBusy />
              <i className="ph ph-clock-counter-clockwise" />
              <span>Adjustment Log</span>
              <span className="badge b-none">{(recent || []).length}</span>
            </IntentLink>

            <IntentLink
              href={baseHref({ tab: 'form', store: storeId, q: term })}
              className={`tab${subview === 'form' ? ' on' : ''}`}
              title="Post Stock Adjustment"
            >
              <LinkBusy />
              <i className="ph ph-sliders-horizontal" />
              <span>Post Adjustment</span>
            </IntentLink>
          </nav>

          <div className="tbl-filters">
            {subview === 'log' && (
              <>
                {/* Store Filter */}
                <StoreFilter stores={stores} storeId={storeId} term={term} tab={subview} />

                {/* Search */}
                <form className="sw">
                  <i className="ph ph-magnifying-glass" />
                  <input
                    className="tsearch"
                    name="q"
                    defaultValue={term}
                    placeholder="Search ref, material, reason…"
                    aria-label="Search adjustments"
                  />
                  {storeId && <input type="hidden" name="store" value={storeId} />}
                </form>

                {/* Secondary Action: Load CSV Modal */}
                <Modal
                  title="Load opening stock"
                  icon="ph-upload-simple"
                  label="Load Opening (CSV)"
                  btnIcon="ph-upload-simple"
                  btnClass="btn btn-subtle btn-sm"
                >
                  <form action={importOpening}>
                    <div className="modal-body">
                      <p>
                        Save the Excel sheet as <b>CSV UTF-8</b> with the columns <b>store_code, material_code, qty</b> (codes as in the Stores and Materials masters).
                      </p>
                      <p className="muted">
                        A store + material that already has stock entries is refused, so the file can't be loaded twice.
                      </p>
                      <div className="fg">
                        <label htmlFor="odate">Opening date</label>
                        <input id="odate" name="date" type="date" defaultValue={today()} max={today()} required />
                      </div>
                      <FileDrop name="file" accept=".csv,text/csv" hint="CSV, max 4 MB" maxMB={4} />
                    </div>
                    <ModalFoot label="Load" icon="ph-upload-simple" />
                  </form>
                </Modal>

                {/* Primary Action: New Adjustment */}
                <Link
                  prefetch={false}
                  href={baseHref({ tab: 'form', store: storeId, q: term })}
                  className="btn btn-primary btn-sm"
                >
                  <LinkBusy />
                  <i className="ph ph-plus" />
                  New Adjustment
                </Link>
              </>
            )}

            {subview === 'form' && (
              <Link
                prefetch={false}
                href={baseHref({ tab: 'log', store: storeId, q: term })}
                className="btn btn-subtle btn-sm"
              >
                <i className="ph ph-clock-counter-clockwise" />
                Back to Log
              </Link>
            )}
          </div>
        </div>

        {/* ── Subview 1: High-Density Audit Log Table ── */}
        {subview === 'log' && (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Ref No</th>
                  <th>Date</th>
                  <th>Store</th>
                  <th>Material</th>
                  <th className="r">Adjustment Qty</th>
                  <th>Reason / File</th>
                  <th>Adjusted By</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((v) => {
                  const isPositive = Number(v.qty) > 0
                  const isOpening = v.ref_type === 'OPENING'
                  return (
                    <tr key={v.id}>
                      <td className="nowrap" data-label="Ref No">
                        <span
                          className={`badge ${isOpening ? 'b-teal font-mono' : 'b-none font-mono'}`}
                          style={!isOpening ? { background: 'var(--surface-sunken)', border: '1px solid var(--border)' } : {}}
                        >
                          {v.ref_no || (isOpening ? 'OPENING' : 'ADJUST')}
                        </span>
                      </td>
                      <td className="nowrap" data-label="Date">{day(v.move_date)}</td>
                      <td data-label="Store">{storeLabel(v.store)}</td>
                      <td data-label="Material">
                        <span className="mat-name">{v.m?.name || '—'}</span>
                        {v.m?.code && <span className="mat-sub">{v.m.code}</span>}
                      </td>
                      <td
                        className="num fw7"
                        data-label="Adjustment Qty"
                        style={{ color: isPositive ? 'var(--ok, #00875a)' : 'var(--danger, #d70015)', fontSize: '0.92rem' }}
                      >
                        {isPositive ? `+${qty(v.qty)}` : qty(v.qty)} {v.m?.uom || ''}
                      </td>
                      <td data-label="Reason">{v.note || <span className="muted">—</span>}</td>
                      <td data-label="Adjusted By">{v.by_name || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {!rows.length && (
              <div className="empty">
                <i className="ph ph-sliders-horizontal" />
                <h3>No adjustments found</h3>
                <p>
                  {term || storeId
                    ? 'No adjustment entries match your search filters.'
                    : 'Start by posting a stock adjustment or loading opening stock.'}
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── Subview 2: Clean Inline Adjustment Form ── */}
        {subview === 'form' && (
          <div style={{ padding: '20px 24px' }}>
            <LinesForm
              action={postAdjustment}
              materials={materials}
              signed
              submit={{ label: 'Post Adjustment', icon: 'ph-check' }}
            >
              <h2 className="fsec-ttl" style={{ marginBottom: 16 }}>
                <i className="ph ph-sliders-horizontal" />Stock adjustment details
              </h2>
              <div className="fgrid-2">
                <div className="fg">
                  <label htmlFor="store">Store <span className="req">*</span></label>
                  <Combobox
                    id="store"
                    name="store"
                    placeholder="Select store…"
                    required
                    requiredMsg="Choose a store."
                    wide
                    options={stores.map((s) => ({
                      value: String(s.id),
                      label: storeLabel(s),
                      badge: s.type,
                    }))}
                  />
                </div>
                <div className="fg">
                  <label htmlFor="date">Adjustment Date</label>
                  <input id="date" name="date" type="date" defaultValue={today()} max={today()} required />
                </div>
                <div className="fg full">
                  <label htmlFor="reason">Reason for Adjustment <span className="req">*</span></label>
                  <input
                    id="reason"
                    name="reason"
                    required
                    placeholder="Stock count difference, damaged sheet, found in store, QC scrap…"
                  />
                </div>
              </div>
            </LinesForm>
          </div>
        )}
      </div>
    </>
  )
}
