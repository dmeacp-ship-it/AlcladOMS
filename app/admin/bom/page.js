import Link from 'next/link'
import { requireRole } from '@/lib/server'
import { listCoreSettings } from '@/lib/bom-server'
import { invMasters } from '@/lib/inventory'
import { ClickRow, IntentLink, LinkBusy } from '../../ui'
import BomDialog from './BomDialog'
import CalculatorCard from './CalculatorCard'

export const metadata = { title: 'BOM & Recipes' }

export default async function AdminBomPage({ searchParams }) {
  await requireRole(['admin', 'manager'])
  const sp = await searchParams
  const subview = sp.tab || 'settings'
  const term = String(sp.q || '').trim().toLowerCase()
  const viewId = sp.view || null

  const [{ settings: coreSettings }, { materials }] = await Promise.all([
    listCoreSettings(),
    invMasters(),
  ])

  // Filter core settings
  const filteredSettings = coreSettings.filter((s) => {
    if (!term) return true
    return (
      s.core_type?.toLowerCase().includes(term) ||
      s.name?.toLowerCase().includes(term) ||
      s.core_mat?.name?.toLowerCase().includes(term)
    )
  })

  // Selected core setting for edit dialog
  const activeSetting = viewId
    ? coreSettings.find((s) => String(s.core_type).toUpperCase() === String(viewId).toUpperCase())
    : null

  const baseHref = (p) => {
    const q = new URLSearchParams()
    if (p.tab && p.tab !== 'settings') q.set('tab', p.tab)
    if (p.q) q.set('q', p.q)
    const qs = q.toString()
    return `/admin/bom${qs ? `?${qs}` : ''}`
  }

  const viewHref = (coreType) => {
    const q = new URLSearchParams()
    if (subview !== 'settings') q.set('tab', subview)
    if (term) q.set('q', term)
    q.set('view', coreType)
    return `/admin/bom?${q.toString()}`
  }

  const closeHref = baseHref({ tab: subview, q: term })

  return (
    <>
      <div className="card">
        {/* ── Toolbar Header ── */}
        <div className="tbl-top">
          <nav className="tabs tabs-dynamic mb-0" aria-label="BOM views">
            <IntentLink
              href={baseHref({ tab: 'settings', q: term })}
              className={`tab${subview === 'settings' || subview === 'recipes' ? ' on' : ''}`}
              title={`Parametric Core Recipes (${coreSettings.length})`}
            >
              <LinkBusy />
              <i className="ph ph-sliders" />
              <span>Core Recipes &amp; Parameters</span>
              <span className="badge b-none">{coreSettings.length}</span>
            </IntentLink>

            <IntentLink
              href={baseHref({ tab: 'calc', q: term })}
              className={`tab${subview === 'calc' ? ' on' : ''}`}
              title="Parametric ACP BOM Calculator"
            >
              <LinkBusy />
              <i className="ph ph-calculator" />
              <span>Formula Calculator</span>
            </IntentLink>
          </nav>

          <div className="tbl-filters">
            {(subview === 'settings' || subview === 'recipes') && (
              <form className="sw">
                <i className="ph ph-magnifying-glass" />
                <input
                  className="tsearch"
                  name="q"
                  defaultValue={term}
                  placeholder="Search core recipes…"
                  aria-label="Search core recipes"
                />
              </form>
            )}
          </div>
        </div>

        {/* ── Subview 1: Core-Type Settings Table ── */}
        {(subview === 'settings' || subview === 'recipes') && (
          <div className="tbl-wrap">
            <table className="tbl bom-tbl">
              <thead>
                <tr>
                  <th>Core Type &amp; Name</th>
                  <th className="r">Core Density</th>
                  <th className="r">Scrap %</th>
                  <th>Core Stock Material</th>
                  <th>Adhesive Film</th>
                  <th>Masking Film</th>
                  <th className="c-skin">Bottom skin</th>
                  <th className="r c-act">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredSettings.map((s) => (
                  <ClickRow key={s.core_type} href={viewHref(s.core_type)}>
                    <td data-label="Core Type & Name">
                      <span className="fw6">{s.name}</span>
                      <span className="mat-sub">{s.core_type}</span>
                    </td>

                    <td className="num fw7" data-label="Core Density">
                      {s.density} <span className="muted text-xs">g/cm³</span>
                    </td>

                    <td className="num" data-label="Scrap %">
                      <span className="badge b-none">+{s.scrap_pct}%</span>
                    </td>

                    <td data-label="Core Stock Material">
                      {s.blend_enabled && s.blend_components?.length ? (
                        <div>
                          <span className="badge b-info mb-4 fw6">
                            Blend ({s.blend_components.length} materials)
                          </span>
                          <div className="muted text-xs">
                            {s.blend_components.map((c) => `${c.name || 'Component'}: ${c.ratio_pct}%`).join(' · ')}
                          </div>
                        </div>
                      ) : s.core_mat ? (
                        <div>
                          <span className="mat-name">{s.core_mat.name}</span>
                          <span className="mat-sub">{s.core_mat.code}</span>
                        </div>
                      ) : (
                        <span className="muted text-xs">Not linked (Click to set)</span>
                      )}
                    </td>

                    <td data-label="Adhesive Film">
                      {s.adh_mat ? (
                        <span className="text-sm">{s.adh_mat.name}</span>
                      ) : (
                        <span className="muted text-xs">{s.adh_rate_per_m2} kg/m²</span>
                      )}
                    </td>

                    <td data-label="Masking Film">
                      {s.mask_mat ? (
                        <span className="text-sm">{s.mask_mat.name}</span>
                      ) : (
                        <span className="muted text-xs">{s.mask_rate_per_m2} m²/m²</span>
                      )}
                    </td>

                    <td className="c-skin" data-label="Bottom skin">
                      <span className="badge b-none text-xs">
                        {s.bottom_skin_mode === 'STANDARD_020' ? 'Fixed 0.20mm' : 'Same as Top'}
                      </span>
                    </td>

                    <td className="r c-act nowrap" data-label="Action">
                      <span className="btn-link"><i className="ph ph-pencil-simple" />Edit</span>
                    </td>
                  </ClickRow>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Subview 2: Parametric Calculator ── */}
        {subview === 'calc' && <CalculatorCard coreSettings={coreSettings} />}
      </div>

      {/* ── Edit Core Setting Dialog ── */}
      {activeSetting && (
        <BomDialog setting={activeSetting} materials={materials} closeHref={closeHref} />
      )}
    </>
  )
}
