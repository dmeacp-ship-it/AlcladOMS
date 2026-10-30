// Parametric BOM & Material Consumption Engine for ACP Manufacturing

// 1. Default Standard Core Specifications (Saudi / GCC Standards)
export const DEFAULT_CORE_SETTINGS = {
  NFR: {
    core_type: 'NFR',
    name: 'Non-Fire Rated (PE Core)',
    density: 0.92,
    scrap_pct: 3.0,
    uom: 'KG',
    adh_rate_per_m2: 0.090,
    mask_rate_per_m2: 1.020,
    bottom_skin_mode: 'SAME_AS_TOP',
    blend_enabled: false,
    blend_components: [],
  },
  FRB1: {
    core_type: 'FRB1',
    name: 'Fire Retardant Class B1 Core',
    density: 1.60,
    scrap_pct: 3.0,
    uom: 'KG',
    adh_rate_per_m2: 0.100,
    mask_rate_per_m2: 1.020,
    bottom_skin_mode: 'SAME_AS_TOP',
    blend_enabled: false,
    blend_components: [],
  },
  FRA2: {
    core_type: 'FRA2',
    name: 'Non-Combustible Mineral A2 Core',
    density: 1.90,
    scrap_pct: 3.0,
    uom: 'KG',
    adh_rate_per_m2: 0.100,
    mask_rate_per_m2: 1.020,
    bottom_skin_mode: 'SAME_AS_TOP',
    blend_enabled: false,
    blend_components: [],
  },
}

// Normalize various core abbreviations from orders / products
export function normalizeCore(core) {
  const c = String(core || '').trim().toUpperCase()
  if (!c || c === 'PE' || c === 'NFR' || c === 'LDPE' || c === 'STANDARD') return 'NFR'
  if (c.includes('B1') || c.includes('FR3') || c === 'FR' || c === 'FR-B1' || c === 'FRB1') return 'FRB1'
  if (c.includes('A2') || c.includes('FR2') || c.includes('MINERAL') || c === 'FR-A2' || c === 'FRA2') return 'FRA2'
  return c
}

// 2. Parametric Calculation for a Single Product Specification & Area
export function calcPanelBOM(spec, qty, coreSettingsMap = DEFAULT_CORE_SETTINGS) {
  const pieces = Number(qty) || 0
  const width = Number(spec.width) || 1250
  const length = Number(spec.length) || 2440
  const totalThick = Number(spec.thickness) || 4.0
  const topSkin = Number(spec.skin || spec.top_skin) || 0.25
  const colorCode = spec.color_code || spec.color || ''
  const colorName = spec.color_name || ''
  const coreKey = normalizeCore(spec.core || spec.grade)
  const coreConf = coreSettingsMap[coreKey]
  // No settings for this core type: say so instead of costing it as another core.
  if (!coreConf) return { pieces, coreKey, missingCore: true, totalM2: 0, layers: [] }

  let botSkin = topSkin
  if (spec.bottom_skin != null && Number(spec.bottom_skin) > 0) {
    botSkin = Number(spec.bottom_skin)
  } else if (coreConf.bottom_skin_mode === 'STANDARD_020') {
    botSkin = 0.20
  }

  const m2PerPc = (width * length) / 1e6
  const totalM2 = pieces * m2PerPc
  const scrapMult = 1 + (Number(coreConf.scrap_pct || 3.0) / 100.0)

  // Aluminum coils density: 2.71 kg/m² per mm of skin thickness
  const AL_DENSITY = 2.71
  const topCoilRate = topSkin * AL_DENSITY * scrapMult
  const topCoilKg = Math.round(totalM2 * topCoilRate * 1000) / 1000

  const botCoilRate = botSkin * AL_DENSITY * scrapMult
  const botCoilKg = Math.round(totalM2 * botCoilRate * 1000) / 1000

  // Core thickness = total thickness - top skin - bottom skin
  const coreThickMm = Math.max(0, Math.round((totalThick - topSkin - botSkin) * 100) / 100)
  const coreDensity = Number(coreConf.density) || 0.92
  const coreRate = coreConf.uom === 'M2'
    ? 1.0 * scrapMult
    : coreThickMm * coreDensity * scrapMult
  const coreQty = Math.round(totalM2 * coreRate * 1000) / 1000

  // Adhesive film: rate per m2 (standard 0.09 - 0.10 kg/m2 for 2 bonding layers)
  const adhRate = Number(coreConf.adh_rate_per_m2 || 0.090) * scrapMult
  const adhKg = Math.round(totalM2 * adhRate * 1000) / 1000

  // Masking film: surface area + overlap (standard 1.02 m2/m2)
  const maskRate = Number(coreConf.mask_rate_per_m2 || 1.020) * scrapMult
  const maskM2 = Math.round(totalM2 * maskRate * 1000) / 1000

  // Multi-component core blend (if enabled) vs standard single core material
  const isBlend = Boolean(coreConf.blend_enabled && Array.isArray(coreConf.blend_components) && coreConf.blend_components.length > 0)
  const coreLayers = isBlend
    ? coreConf.blend_components.map((comp) => {
        const pct = Number(comp.ratio_pct) || 0
        const compRate = Math.round(coreRate * (pct / 100) * 1000) / 1000
        const compQty = Math.round(coreQty * (pct / 100) * 1000) / 1000
        return {
          layer_type: 'CORE',
          layer_name: `${comp.name || 'Core Blend Component'} (${pct}%)`,
          material_id: comp.material_id ? Number(comp.material_id) : null,
          ratio_pct: pct,
          qty: compQty,
          uom: coreConf.uom || 'KG',
          rate_per_m2: compRate,
          scrap_pct: Number(coreConf.scrap_pct || 3.0),
          formula: `${totalM2.toFixed(1)} m² × ${coreRate.toFixed(3)} ${coreConf.uom || 'KG'}/m² × ${pct}%`,
        }
      })
    : [
        {
          layer_type: 'CORE',
          layer_name: `${coreConf.name} (${coreThickMm}mm)`,
          material_id: coreConf.core_material_id,
          qty: coreQty,
          uom: coreConf.uom || 'KG',
          rate_per_m2: Math.round(coreRate * 1000) / 1000,
          scrap_pct: Number(coreConf.scrap_pct || 3.0),
          formula: coreConf.uom === 'M2'
            ? `${totalM2.toFixed(1)} m² × +${coreConf.scrap_pct}%`
            : `${totalM2.toFixed(1)} m² × ${coreThickMm}mm × ${coreDensity} × +${coreConf.scrap_pct}%`,
        },
      ]

  return {
    pieces,
    totalM2: Math.round(totalM2 * 100) / 100,
    m2PerPc: Math.round(m2PerPc * 1000) / 1000,
    coreKey,
    coreConf,
    topSkin,
    botSkin,
    coreThickMm,
    layers: [
      {
        layer_type: 'TOP_COIL',
        layer_name: `Top Coil ${topSkin.toFixed(2)}mm · ${colorName || colorCode || 'Color'}`,
        color_code: colorCode,
        color_name: colorName,
        thickness: topSkin,
        width,
        qty: topCoilKg,
        uom: 'KG',
        rate_per_m2: Math.round(topCoilRate * 1000) / 1000,
        scrap_pct: Number(coreConf.scrap_pct || 3.0),
        formula: `${totalM2.toFixed(1)} m² × ${topSkin}mm × 2.71 × +${coreConf.scrap_pct}%`,
      },
      {
        layer_type: 'BOTTOM_COIL',
        layer_name: `Bottom Coil ${botSkin.toFixed(2)}mm (Service Coat)`,
        thickness: botSkin,
        width,
        qty: botCoilKg,
        uom: 'KG',
        rate_per_m2: Math.round(botCoilRate * 1000) / 1000,
        scrap_pct: Number(coreConf.scrap_pct || 3.0),
        formula: `${totalM2.toFixed(1)} m² × ${botSkin}mm × 2.71 × +${coreConf.scrap_pct}%`,
      },
      ...coreLayers,
      {
        layer_type: 'ADHESIVE_FILM',
        layer_name: 'Polymer Adhesive Film',
        material_id: coreConf.adh_material_id,
        qty: adhKg,
        uom: 'KG',
        rate_per_m2: Math.round(adhRate * 1000) / 1000,
        scrap_pct: Number(coreConf.scrap_pct || 3.0),
        formula: `${totalM2.toFixed(1)} m² × ${coreConf.adh_rate_per_m2} kg/m² × +${coreConf.scrap_pct}%`,
      },
      {
        layer_type: 'MASKING_FILM',
        layer_name: 'Protective PE Masking Film',
        material_id: coreConf.mask_material_id,
        qty: maskM2,
        uom: 'M2',
        rate_per_m2: Math.round(maskRate * 1000) / 1000,
        scrap_pct: Number(coreConf.scrap_pct || 3.0),
        formula: `${totalM2.toFixed(1)} m² × ${coreConf.mask_rate_per_m2} m²/m² × +${coreConf.scrap_pct}%`,
      },
    ],
  }
}

// 3. Match Material from Inventory by Physical Attributes
export function findMatchingMaterial(materials, criteria) {
  if (!materials?.length) return null
  const { kind, colorCode, thickness, width } = criteria
  const th = Number(thickness) || 0
  const w = Number(width) || 0

  // 1–2. Coils: same kind, same thickness, wide enough, and for top coils the product's colour; the
  // narrowest such coil wins. No near-miss guesses: a wrong coil is worse than none (the operator must pick).
  if (kind === 'TOP_COIL' || kind === 'BOTTOM_COIL') {
    const color = String(colorCode || '').trim().toUpperCase()
    if (kind === 'TOP_COIL' && !color) return null
    const fits = materials.filter((m) => m.kind === kind
      && (kind === 'BOTTOM_COIL' || String(m.color_code || '').trim().toUpperCase() === color)
      && Math.abs(Number(m.thickness) - th) < 0.005
      && (!w || Number(m.width) >= w))
    return fits.sort((x, y) => Number(x.width) - Number(y.width))[0] || null
  }

  // 3. Core materials
  if (kind === 'CORE') {
    const coreKey = normalizeCore(criteria.coreType)
    const match = materials.find((m) => {
      if (m.kind !== 'CORE' && m.category !== 'GRANULE' && !m.name.toLowerCase().includes('granule')) return false
      const txt = `${m.code} ${m.name}`.toUpperCase()
      if (coreKey === 'NFR') return txt.includes('LDPE') || txt.includes('PE')
      if (coreKey === 'FRB1') return txt.includes('FR3') || txt.includes('FRB1') || txt.includes('FR-B1') || txt.includes('B1')
      if (coreKey === 'FRA2') return txt.includes('FR2') || txt.includes('FRA2') || txt.includes('FR-A2') || txt.includes('A2')
      return false
    })
    if (match) return match
  }

  // 4. Adhesive film
  if (kind === 'ADHESIVE') {
    const match = materials.find((m) => m.kind === 'ADHESIVE' || m.code?.includes('ADH') || m.name?.toLowerCase().includes('adhesive'))
    if (match) return match
  }

  // 5. Masking film
  if (kind === 'MASKING') {
    const match = materials.find((m) => m.kind === 'MASKING' || m.name?.toLowerCase().includes('protective') || m.name?.toLowerCase().includes('masking'))
    if (match) return match
  }

  return null
}

// 4. Calculate Aggregate Requirements for DPR (Multiple Products)
export function calcDprBOM(productionItems, coreSettingsList, materials = []) {
  const settingsMap = Array.isArray(coreSettingsList)
    ? Object.fromEntries(coreSettingsList.map((s) => [s.core_type, s]))
    : (coreSettingsList || DEFAULT_CORE_SETTINGS)

  const rows = []
  const topCoilMap = {}
  const botCoilMap = {} // one row per bottom-coil thickness and width
  const coreMap = {}
  const adhMap = {} // one row per adhesive material (FR-A2 uses its own film)
  const maskMap = {}
  const missingCores = new Set()
  const add = (map, key, base, qty) => { (map[key] ||= { ...base, system_qty: 0 }).system_qty += qty }

  for (const item of (productionItems || [])) {
    const good = Number(item.good_qty || item.good || 0)
    const rej = Number(item.rejected_qty || item.rejected || 0)
    const totalPcs = good + rej
    if (totalPcs <= 0) continue

    const spec = item.fg_item || item.item_spec || item
    const bom = calcPanelBOM(spec, totalPcs, settingsMap)
    if (bom.missingCore) missingCores.add(bom.coreKey || '(blank)')

    for (const layer of bom.layers) {
      if (layer.layer_type === 'TOP_COIL') {
        add(topCoilMap, `${layer.color_code || 'DEF'}-${layer.thickness}-${layer.width}`, {
          layer_name: layer.layer_name, color_code: layer.color_code, color_name: layer.color_name,
          thickness: layer.thickness, width: layer.width, scrap_pct: layer.scrap_pct,
        }, layer.qty)
      } else if (layer.layer_type === 'BOTTOM_COIL') {
        const botKey = `${layer.thickness}-${layer.width}`
        const b = (botCoilMap[botKey] ||= { thickness: layer.thickness, width: layer.width, system_qty: 0 })
        b.system_qty += layer.qty
      } else if (layer.layer_type === 'CORE') {
        const coreKey = layer.ratio_pct != null
          ? `${bom.coreKey}-blend-${layer.material_id || layer.layer_name.replace(/[^a-zA-Z0-9]/g, '_')}`
          : bom.coreKey
        add(coreMap, coreKey, {
          layer_name: layer.layer_name,
          core_type: bom.coreKey,
          material_id: layer.material_id,
          ratio_pct: layer.ratio_pct,
          uom: layer.uom,
        }, layer.qty)
      } else if (layer.layer_type === 'ADHESIVE_FILM') {
        add(adhMap, layer.material_id || 'none', { material_id: layer.material_id }, layer.qty)
      } else if (layer.layer_type === 'MASKING_FILM') {
        add(maskMap, layer.material_id || 'none', { material_id: layer.material_id }, layer.qty)
      }
    }
  }

  // 1. Top Coils (one per color, thickness and width used in the shift)
  for (const tc of Object.values(topCoilMap)) {
    const suggested = findMatchingMaterial(materials, {
      kind: 'TOP_COIL',
      colorCode: tc.color_code,
      thickness: tc.thickness,
      width: tc.width,
    })
    rows.push({
      key: `top-${tc.color_code || 'DEF'}-${tc.thickness}-${tc.width}`,
      layer_type: 'TOP_COIL',
      layer_name: tc.layer_name,
      material_id: suggested?.id || null,
      suggested_mat_id: suggested?.id || null,
      material_name: suggested?.name || tc.layer_name,
      material_code: suggested?.code || '—',
      color_code: tc.color_code,
      system_qty: Math.round(tc.system_qty * 10) / 10,
      actual_qty: Math.round(tc.system_qty * 10) / 10,
      uom: 'KG',
      scrap_pct: tc.scrap_pct,
      is_coil: true,
    })
  }

  // 2. Bottom Coils (one per thickness and width used in the shift)
  for (const bc of Object.values(botCoilMap)) {
    const suggestedBot = findMatchingMaterial(materials, { kind: 'BOTTOM_COIL', thickness: bc.thickness, width: bc.width })
    rows.push({
      key: `bot-${bc.thickness}-${bc.width}`,
      layer_type: 'BOTTOM_COIL',
      layer_name: `Bottom Coil ${bc.thickness.toFixed(2)}mm · ${bc.width}mm (Service Coat)`,
      material_id: suggestedBot?.id || null,
      suggested_mat_id: suggestedBot?.id || null,
      material_name: suggestedBot?.name || `Bottom Coil ${bc.thickness.toFixed(2)}mm (Service Coat)`,
      material_code: suggestedBot?.code || '—',
      system_qty: Math.round(bc.system_qty * 10) / 10,
      actual_qty: Math.round(bc.system_qty * 10) / 10,
      uom: 'KG',
      is_coil: true,
    })
  }

  // 3. Core Granules / Boards / Blend Components
  for (const cm of Object.values(coreMap)) {
    const suggestedCore = cm.material_id
      ? materials.find((m) => m.id === cm.material_id)
      : findMatchingMaterial(materials, { kind: 'CORE', coreType: cm.core_type })
    const key = cm.ratio_pct != null
      ? `core-${cm.core_type}-${cm.material_id || cm.layer_name.replace(/[^a-zA-Z0-9]/g, '_')}`
      : `core-${cm.core_type}`
    rows.push({
      key,
      layer_type: 'CORE',
      layer_name: cm.layer_name,
      material_id: suggestedCore?.id || cm.material_id || null,
      suggested_mat_id: suggestedCore?.id || cm.material_id || null,
      material_name: suggestedCore?.name || cm.layer_name,
      material_code: suggestedCore?.code || '—',
      system_qty: Math.round(cm.system_qty * 10) / 10,
      actual_qty: Math.round(cm.system_qty * 10) / 10,
      uom: cm.uom || 'KG',
      is_coil: false,
    })
  }

  // 4–5. Adhesive and masking film, one row per material
  const films = [
    [adhMap, 'adh', 'ADHESIVE_FILM', 'ADHESIVE', 'Polymer Adhesive Film', 'KG'],
    [maskMap, 'mask', 'MASKING_FILM', 'MASKING', 'Protective PE Masking Film', 'M2'],
  ]
  for (const [map, prefix, layerType, kind, label, uom] of films) {
    for (const [k, f] of Object.entries(map)) {
      const mat = f.material_id ? materials.find((m) => m.id === f.material_id) : findMatchingMaterial(materials, { kind })
      rows.push({
        key: `${prefix}-${k}`,
        layer_type: layerType,
        layer_name: label,
        material_id: mat?.id || f.material_id || null,
        suggested_mat_id: mat?.id || f.material_id || null,
        material_name: mat?.name || label,
        material_code: mat?.code || '—',
        system_qty: Math.round(f.system_qty * 10) / 10,
        actual_qty: Math.round(f.system_qty * 10) / 10,
        uom,
        is_coil: false,
      })
    }
  }

  // ponytail: list extra on the array so callers that only want rows keep working.
  rows.missingCores = [...missingCores]
  return rows
}
