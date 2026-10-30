import { db } from './server.js'
import { DEFAULT_CORE_SETTINGS, normalizeCore } from './bom.js'

// Fetch all Core Settings from database (falls back to defaults if table not yet created)
export async function listCoreSettings() {
  try {
    const { data, error } = await db()
      .from('core_settings')
      .select('*, core_mat:materials!core_material_id(id, code, name, uom, cost_price), adh_mat:materials!adh_material_id(id, code, name, uom, cost_price), mask_mat:materials!mask_material_id(id, code, name, uom, cost_price)')
      .order('core_type', { ascending: true })

    if (error || !data?.length) {
      return { settings: Object.values(DEFAULT_CORE_SETTINGS), isDb: false }
    }
    return { settings: data, isDb: true }
  } catch {
    return { settings: Object.values(DEFAULT_CORE_SETTINGS), isDb: false }
  }
}

// Save or update a core setting in DB
export async function saveCoreSetting(setting) {
  const coreType = normalizeCore(setting.core_type)
  const payload = {
    core_type: coreType,
    name: setting.name || DEFAULT_CORE_SETTINGS[coreType]?.name || coreType,
    density: Number(setting.density) || 0.92,
    scrap_pct: Number(setting.scrap_pct ?? 3.0),
    uom: setting.uom || 'KG',
    core_material_id: setting.core_material_id ? Number(setting.core_material_id) : null,
    adh_material_id: setting.adh_material_id ? Number(setting.adh_material_id) : null,
    adh_rate_per_m2: Number(setting.adh_rate_per_m2 ?? 0.090),
    mask_material_id: setting.mask_material_id ? Number(setting.mask_material_id) : null,
    mask_rate_per_m2: Number(setting.mask_rate_per_m2 ?? 1.020),
    bottom_skin_mode: setting.bottom_skin_mode || 'SAME_AS_TOP',
    blend_enabled: Boolean(setting.blend_enabled),
    blend_components: Array.isArray(setting.blend_components) ? setting.blend_components : [],
    updated_at: new Date().toISOString(),
  }

  const { error } = await db().from('core_settings').upsert(payload)
  if (error) throw error
  return payload
}
