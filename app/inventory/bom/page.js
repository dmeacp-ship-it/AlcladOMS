import Link from 'next/link'
import { db, requireRole } from '@/lib/server'
import { listBOMs } from '@/lib/bom'
import { day, money, qty } from '@/lib/tas'
import { storeLabel } from '@/lib/inventory'
import { ClickRow, IntentLink, LinkBusy } from '../../ui'
import InvTabs from '../InvTabs'
import BomDialog from './BomDialog'
import CalculatorCard from './CalculatorCard'
import NewRecipeDialog from './NewRecipeDialog'

export const metadata = { title: 'BOM & Recipes' }

export default async function BomPage({ searchParams }) {
  const sp = await searchParams
  const subview = sp.tab || 'recipes'
  const grade = sp.grade || ''
  const term = String(sp.q || '').trim().toLowerCase()
  const viewId = sp.view || null
  const isNew = Boolean(sp.new)

  const [, { boms, isDb }, issuesRes] = await Promise.all([
    requireRole('manager'),
    listBOMs(),
    db()
      .from('transfers')
      .select('*, from:stores!from_store_id(name, plant_code), to:stores!to_store_id(name, plant_code), items:transfer_items(id)')
      .order('id', { ascending: false })
      .limit(30),
  ])

  const issues = issuesRes?.data || []

  // Filter recipes
  let filteredBoms = boms.filter((b) => {
    if (grade && String(b.grade).toUpperCase() !== grade.toUpperCase()) return false
    if (term) {
      const match =
        b.code?.toLowerCase().includes(term) ||
        b.name?.toLowerCase().includes(term) ||
        b.grade?.toLowerCase().includes(term) ||
        b.description?.toLowerCase().includes(term)
      if (!match) return false
    }
    return true
  })

  // Selected recipe for dialog
  const activeBom = viewId ? boms.find((b) => String(b.id) === String(viewId) || b.code === viewId) : null

  const baseHref = (p) => {
    const q = new URLSearchParams()
    if (p.tab && p.tab !== 'recipes') q.set('tab', p.tab)
    if (p.grade) q.set('grade', p.grade)
    if (p.q) q.set('q', p.q)
    const qs = q.toString()
    return `/inventory/bom${qs ? `?${qs}` : ''}`
  }

  const viewHref = (id) => {
    const q = new URLSearchParams()
    if (subview !== 'recipes') q.set('tab', subview)
    if (grade) q.set('grade', grade)
    if (term) q.set('q', term)
    q.set('view', id)
    return `/inventory/bom?${q.toString()}`
  }

  const newHref = () => {
    const q = new URLSearchParams()
    if (subview !== 'recipes') q.set('tab', subview)
    if (grade) q.set('grade', grade)
    if (term) q.set('q', term)
    q.set('new', '1')
    return `/inventory/bom?${q.toString()}`
  }

  const closeHref = baseHref({ tab: subview, grade, q: term })

  return (
    <>
      <InvTabs tab="bom" missing={false} />

      <div className="card">
        {/* ── Unified Card Header Toolbar (Proposal 1) ── */}
        <div className="tbl-top">
          <nav className="tabs tabs-dynamic" aria-label="BOM views" style={{ marginBottom: 0 }}>
            <IntentLink
              href={baseHref({ tab: 'recipes', grade, q: term })}
              className={`tab${subview === 'recipes' ? ' on' : ''}`}
              title={`Parametric Recipes (${boms.length})`}
            >
              <LinkBusy />
              <i className="ph ph-receipt" />
              <span>Recipes</span>
              <span className="badge b-none">{boms.length}</span>
            </IntentLink>

            <IntentLink
              href={baseHref({ tab: 'calc', grade, q: term })}
              className={`tab${subview === 'calc' ? ' on' : ''}`}
              title="Live Formula Calculator"
            >
              <LinkBusy />
              <i className="ph ph-lightning" />
              <span>Formula Calculator</span>
            </IntentLink>

            <IntentLink
              href={baseHref({ tab: 'issues', grade, q: term })}
              className={`tab${subview === 'issues' ? ' on' : ''}`}
              title={`Issue to Line History (${issues.length})`}
            >
              <LinkBusy />
              <i className="ph ph-arrows-left-right" />
              <span>Issue History</span>
              <span className="badge b-none">{issues.length}</span>
            </IntentLink>
          </nav>

          <div className="tbl-filters">
            {subview === 'recipes' && (
              <>
                {/* Grade Segmented Pills */}
                <div style={{ display: 'flex', gap: 4, background: 'var(--surface-sunken)', padding: 3, borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                  {[
                    ['', 'All Grades'],
                    ['PE', 'PE'],
                    ['FR-B1', 'FR-B1'],
                  ].map(([val, label]) => {
                    const isActive = grade === val
                    return (
                      <IntentLink
                        key={val || 'all'}
                        href={baseHref({ tab: 'recipes', grade: val, q: term })}
                        className={`badge ${isActive ? 'b-primary fw7' : 'b-none'}`}
                        style={{ cursor: 'pointer', padding: '4px 8px', fontSize: '0.78rem' }}
                      >
                        {label}
                      </IntentLink>
                    )
                  })}
                </div>

                {/* Search */}
                <form className="sw">
                  <i className="ph ph-magnifying-glass" />
                  <input
                    className="tsearch"
                    name="q"
                    defaultValue={term}
                    placeholder="Search recipes…"
                    aria-label="Search recipes"
                  />
                  {grade && <input type="hidden" name="grade" value={grade} />}
                </form>
              </>
            )}

            {/* Secondary Action: Issue Material */}
            <Link prefetch={false} href="/inventory/issue/new" className="btn btn-subtle btn-sm">
              <LinkBusy />
              <i className="ph ph-arrows-left-right" />
              Issue to Line
            </Link>

            {/* Primary Action: New Recipe */}
            <Link prefetch={false} href={newHref()} className="btn btn-primary btn-sm">
              <LinkBusy />
              <i className="ph ph-plus" />
              New Recipe
            </Link>
          </div>
        </div>

        {/* ── Subview 1: High-Density Recipes Table ── */}
        {subview === 'recipes' && (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Recipe &amp; Spec</th>
                  <th className="r">Total (mm)</th>
                  <th>Layer Architecture (Top · Core · Bottom)</th>
                  <th className="r">Layers</th>
                  <th className="r">Total RM / M²</th>
                  <th>Status</th>
                  <th className="r">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredBoms.map((b) => {
                  const coreMm =
                    b.core_thick ||
                    Math.round((Number(b.thickness) - Number(b.top_skin) - Number(b.bottom_skin)) * 100) / 100
                  const items = b.items || []
                  const totalKgM2 = items
                    .filter((i) => i.uom === 'KG')
                    .reduce((sum, i) => sum + Number(i.qty_per_m2 || 0) * (1 + Number(i.scrap_pct || 0) / 100), 0)

                  return (
                    <ClickRow key={b.id} href={viewHref(b.id)}>
                      {/* Column 1: Recipe Code & Spec */}
                      <td data-label="Recipe & Spec">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                          <span
                            className="badge b-none font-mono fw6"
                            style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)', fontSize: '0.8rem' }}
                          >
                            {b.code}
                          </span>
                          <span className={`badge ${b.grade === 'FR-B1' || b.grade === 'FR-A2' ? 'b-warn' : 'b-blue'}`}>
                            {b.grade}
                          </span>
                        </div>
                        <div className="mat-name" style={{ fontWeight: 600 }}>{b.name}</div>
                      </td>

                      {/* Column 2: Total Thickness */}
                      <td className="num fw7" data-label="Total (mm)" style={{ fontSize: '0.95rem' }}>
                        {b.thickness} mm
                      </td>

                      {/* Column 3: Micro-Pill Layer Architecture */}
                      <td data-label="Layer Architecture">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                          <span
                            className="badge b-none"
                            style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)', fontSize: '0.78rem' }}
                          >
                            Top: <b>{b.top_skin}mm</b>
                          </span>
                          <span className="muted text-xs">·</span>
                          <span
                            className="badge b-none"
                            style={{
                              background: 'var(--surface-sunken)',
                              border: '1px solid var(--border)',
                              fontSize: '0.78rem',
                              color: 'var(--accent)',
                            }}
                          >
                            Core: <b>{coreMm}mm</b>
                          </span>
                          <span className="muted text-xs">·</span>
                          <span
                            className="badge b-none"
                            style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)', fontSize: '0.78rem' }}
                          >
                            Bot: <b>{b.bottom_skin}mm</b>
                          </span>
                        </div>
                      </td>

                      {/* Column 4: Layers */}
                      <td className="num" data-label="Layers">
                        <span className="badge b-none">{items.length} layers</span>
                      </td>

                      {/* Column 5: Total RM / M² KPI */}
                      <td
                        className="num fw7"
                        data-label="Total RM / M²"
                        style={{ color: 'var(--accent)', fontSize: '0.95rem' }}
                      >
                        {money(totalKgM2)} KG
                      </td>

                      {/* Column 6: Status */}
                      <td data-label="Status">
                        <span className="badge b-ok">Active</span>
                      </td>

                      {/* Column 7: Actions */}
                      <td className="r nowrap" data-label="Actions">
                        <Link prefetch={false} href={viewHref(b.id)} className="btn btn-subtle btn-xs">
                          <i className="ph ph-receipt" />View Formula
                        </Link>
                      </td>
                    </ClickRow>
                  )
                })}
              </tbody>
            </table>

            {!filteredBoms.length && (
              <div className="empty">
                <i className="ph ph-receipt" />
                <h3>No recipes match</h3>
                <p>Try clearing your grade filter or search query.</p>
              </div>
            )}
          </div>
        )}

        {/* ── Subview 2: Full Parametric Calculator ── */}
        {subview === 'calc' && (
          <CalculatorCard boms={boms} />
        )}

        {/* ── Subview 3: Past Issues to Line ── */}
        {subview === 'issues' && (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Issue No</th>
                  <th>Date</th>
                  <th>From Store</th>
                  <th>To Line</th>
                  <th>Requested by</th>
                  <th className="r">Lines</th>
                  <th>Entered by</th>
                </tr>
              </thead>
              <tbody>
                {issues.map((t) => (
                  <tr key={t.id}>
                    <td className="nowrap">
                      <Link prefetch={false} className="qno" href={`/inventory/issue?view=${t.id}`}>
                        {t.doc_no}
                      </Link>
                    </td>
                    <td className="nowrap" data-label="Date">{day(t.doc_date)}</td>
                    <td data-label="From">{storeLabel(t.from)}</td>
                    <td className="fw6" data-label="To">{storeLabel(t.to)}</td>
                    <td data-label="Requested by">{t.requested_by || <span className="muted">—</span>}</td>
                    <td className="num" data-label="Lines">{t.items?.length ?? 0}</td>
                    <td data-label="Entered by">{t.by_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!issues.length && (
              <div className="empty">
                <i className="ph ph-arrows-left-right" />
                <h3>No issues yet</h3>
                <p>Generate issue slips from BOM recipes or click Issue to Line.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      {activeBom && (
        <BomDialog
          bom={activeBom}
          closeHref={closeHref}
        />
      )}

      {isNew && (
        <NewRecipeDialog
          closeHref={closeHref}
        />
      )}
    </>
  )
}
