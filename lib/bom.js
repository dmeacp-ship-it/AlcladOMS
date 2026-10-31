// BOM & Material Consumption Engine for ACP Manufacturing.
// Standard grades (4 mm, PE or FR-B1) follow the company STANDARD BOM; anything else uses the parametric formula.

// 1. Default Standard Core Specifications (Saudi / GCC Standards), used only by the parametric formula
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

// 2. Company STANDARD BOM, per 1 SQM of 4 mm panel at 1250 mm width (All_Finished_Goods_BOM.xlsx, 31 Oct 2026).
// skin = grade skin (mm), stock = coil thickness bought for it, top/bot = coated coil kg, trim = side-trimmed
// aluminium kg (negative = comes out as waste). pe / frb1 = [core A kg, core B kg, plastic waste kg].
// AL4045 runs on 0.35 mm stock (0.38 is not available); its consumption stays at the 0.38 standard.
// ponytail: N grades have no finished goods in the sheet yet, so their stock coil is assumed = skin.
const STD_GRADES = {
  AL4050N: { skin: 0.5, stock: 0.5, top: 1.445514, bot: 1.4042136, trim: -0.056994552, pe: [2.98675, 0.1034, -0.32022], frb1: [4.41192, 0.8227875, -0.37952] },
  AL4050: { skin: 0.45, stock: 0.45, top: 1.307846, bot: 1.2665456, trim: -0.051487832, pe: [3.12175, 0.1034, -0.33102], frb1: [4.56072, 0.8505375, -0.39232] },
  AL4045N: { skin: 0.4, stock: 0.4, top: 1.170178, bot: 1.1288776, trim: -0.045981112, pe: [3.25675, 0.1034, -0.34182], frb1: [4.70952, 0.8782875, -0.40512] },
  AL4045: { skin: 0.38, stock: 0.35, top: 1.1151108, bot: 1.0738104, trim: -0.043778424, pe: [3.31075, 0.1034, -0.34614], frb1: [4.76904, 0.8893875, -0.41024] },
  AL4035N: { skin: 0.3, stock: 0.3, top: 0.894842, bot: 0.8535416, trim: -0.034967672, pe: [3.52675, 0.1034, -0.36342], frb1: [5.00712, 0.9337875, -0.43072] },
  AL4035: { skin: 0.24, stock: 0.24, top: 0.7296404, bot: 0.68834, trim: -0.028359608, pe: [3.68875, 0.1034, -0.37638], frb1: [5.18568, 0.9670875, -0.44608] },
  AL4025N: { skin: 0.2, stock: 0.2, top: 0.619506, bot: 0.5782056, trim: -0.023954232, pe: [3.79675, 0.1034, -0.38502], frb1: [5.30472, 0.9892875, -0.45632] },
  AL4025: { skin: 0.18, stock: 0.18, top: 0.5644388, bot: 0.5231384, trim: -0.021751544, pe: [3.85075, 0.1034, -0.38934], frb1: [5.36424, 1.0003875, -0.46144] },
}
const STD_ADHESIVE = 0.1034 // kg/m², both cores
const STD_PROTECTIVE = 1.016 // m²/m² at 1250 mm; other widths use (film width / panel width), as 1510/1500
const STD_PROCESS_WASTE = -0.005 // kg/m² aluminium
const STD_CORE_NAMES = {
  NFR: ['LDPE RECYCLED GRANULE-A', 'LDPE RECYCLED GRANULE-B'],
  FRB1: ['FR3 GRANULES (FRB1)-FRB1', 'CALCIUM COMPOUND FILLER-CaCO3'],
}
export const STANDARD_GRADES = Object.entries(STD_GRADES).flatMap(([grade, g]) => ['NFR', 'FRB1'].map((core) => {
  const [coreA, coreB, plastic] = core === 'FRB1' ? g.frb1 : g.pe
  return { grade, core, skin: g.skin, stock: g.stock, top: g.top, bot: g.bot, coreA, coreB, adh: STD_ADHESIVE, mask: STD_PROTECTIVE, plastic, trim: g.trim, process: STD_PROCESS_WASTE }
}))

// Protective film level by top colour (brand-independent in the standard). Metallics use HIGH.
const FILM_LEVELS = {
  LOW: 'AL1011 AL1022 AL1033 AL1044 AL1055 AL1066 AL2222 AL3333 AL4444',
  MEDIUM: 'AL1001 AL3001 AL3002 AL3003 AL3004 AL3005 AL3006 AL3007 AL3008 AL3009 AL3010 AL3011 AL3012 AL3013 AL3014 AL3015 AL3016 AL3017 AL3018 AL3019 AL3020 AL3021 AL3022 AL5011 AL5022 AL5033 AL8022 RAL7001H TAS022',
  HIGH: 'AL13001 AL13002 AL13003 AL13004 AL13005 AL13006 AL13007 AL13008 AL7001 AL7002 AL7003 AL7004 AL7005 AL7007',
  'SUPER HIGH SS10+': 'AL4001 AL4002 AL4003 AL4004 AL5044 AL6011 AL6022 AL6033 AL6044 AL8001 AL8002 AL8003 AL9011 AL9022 AL9033 AL9044 AL9055 AL9066 AL9077',
}
const FILM_LEVEL_OF = Object.fromEntries(Object.entries(FILM_LEVELS).flatMap(([lvl, codes]) => codes.split(' ').map((c) => [c, lvl])))
export const filmLevel = (colorCode) => FILM_LEVEL_OF[String(colorCode || '').trim().toUpperCase()] || null

// The standard row for a product, or null when it is outside the standard (FR-A2, other thickness, unknown grade).
export function standardFor(spec) {
  const g = STD_GRADES[String(spec.grade || '').trim().toUpperCase()]
  const core = normalizeCore(spec.core)
  const thick = Number(spec.thickness) || 4
  if (!g || (core !== 'NFR' && core !== 'FRB1') || Math.abs(thick - 4) > 0.001) return null
  return STANDARD_GRADES.find((s) => s.grade === String(spec.grade).trim().toUpperCase() && s.core === core)
}

const r3 = (n) => Math.round(n * 1000) / 1000
const r4 = (n) => Math.round(n * 10000) / 10000

function standardBOM(spec, std, pieces) {
  const width = Number(spec.width) || 1250
  const length = Number(spec.length) || 2440
  const colorCode = String(spec.color_code || spec.color || '').trim().toUpperCase()
  const colorName = spec.color_name || ''
  const brand = String(spec.brand || '').trim().toUpperCase()
  const m2PerPc = (width * length) / 1e6
  const totalM2 = pieces * m2PerPc
  // Coils are bought 20 mm wider than the panel, adhesive 30 mm, protective film 10 mm.
  const coilW = width + 20
  const coilFactor = (coilW / width) / (1270 / 1250)
  const filmW = width + 10
  const maskRate = width === 1250 ? std.mask : filmW / width
  const level = filmLevel(colorCode)
  const stock = std.stock.toFixed(2)
  const layer = (layer_type, key, layer_name, rate, uom, match, extra = {}) => ({
    layer_type, key, layer_name, rate_per_m2: r4(rate), qty: r3(totalM2 * rate), uom, match,
    formula: `${totalM2.toFixed(1)} m² × ${r4(rate)} ${uom === 'M2' ? 'm²' : 'kg'}/m² (standard)`, ...extra,
  })
  const [coreA, coreB] = STD_CORE_NAMES[std.core]

  return {
    pieces,
    standard: `${std.grade}${std.core === 'FRB1' ? '-FRB1' : ''}`,
    totalM2: Math.round(totalM2 * 100) / 100,
    m2PerPc: r3(m2PerPc),
    coreKey: std.core,
    topSkin: std.skin,
    botSkin: std.skin,
    coreThickMm: r3(4 - (std.skin + 0.025) - (std.skin + 0.01)),
    coreThickness: r3(4 - (std.skin + 0.025) - (std.skin + 0.01)),
    layers: [
      layer('TOP_COIL', `top-${colorCode || 'DEF'}-${std.stock}-${width}`, `${colorCode || 'COLOUR'}-SDPE-${stock}*${coilW}${colorName ? `-${colorName}` : ''}`,
        std.top * coilFactor, 'KG', { kind: 'TOP_COIL', colorCode, thickness: std.stock, width },
        { color_code: colorCode, color_name: colorName, thickness: std.stock, width, is_coil: true }),
      layer('BOTTOM_COIL', `bot-${std.stock}-${width}`, `BOTTOM COIL-PE-${stock}*${coilW}-Window Grey`,
        std.bot * coilFactor, 'KG', { kind: 'BOTTOM_COIL', thickness: std.stock, width }, { thickness: std.stock, width, is_coil: true }),
      layer('CORE', `core-${coreA}`, coreA, std.coreA, 'KG', { kind: 'NAMED', name: coreA }),
      layer('CORE', `core-${coreB}`, coreB, std.coreB, 'KG', { kind: 'NAMED', name: coreB }),
      layer('ADHESIVE_FILM', `adh-0.05-${width + 30}`, `ADHESIVE FILM-0.05*${width + 30}-NORMAL`,
        STD_ADHESIVE, 'KG', { kind: 'ADHESIVE', thickness: 0.05, width: width + 30 }),
      layer('MASKING_FILM', `mask-${brand}-${level}-${filmW}`, `PROTECTIVE FILM-0.08*${filmW}-${brand || 'BRAND?'}-${level || 'LEVEL?'}`,
        maskRate, 'M2', { kind: 'MASKING', brand, level, width: filmW }),
      layer('WASTE', 'waste-plastic', 'PLASTIC WASTE DURING PRODUCTION LDPE', std.plastic, 'KG', null),
      layer('WASTE', 'waste-trim', 'SIDE TRIMMED ALUMINIUM', std.trim * coilFactor, 'KG', null),
      layer('WASTE', 'waste-process', 'PROCESS WASTE ALUMINIUM', STD_PROCESS_WASTE, 'KG', null),
    ],
  }
}

// 3. BOM for one product spec and piece count: the standard when the product is in it, else the parametric formula.
export function calcPanelBOM(spec, qty, coreSettingsMap = DEFAULT_CORE_SETTINGS) {
  const pieces = Number(qty) || 0
  const std = standardFor(spec)
  if (std) return standardBOM(spec, std, pieces)

  const width = Number(spec.width) || 1250
  const length = Number(spec.length) || 2440
  const totalThick = Number(spec.thickness) || 4.0
  const topSkin = Number(spec.skin || spec.top_skin) || 0.25
  const colorCode = spec.color_code || spec.color || ''
  const colorName = spec.color_name || ''
  const coreKey = normalizeCore(spec.core || spec.grade)
  const coreConf = coreSettingsMap[coreKey]
  // No settings for this core type: say so instead of costing it as another core.
  if (!coreConf) return { pieces, coreKey, missingCore: true, totalM2: 0, coreThickMm: 0, coreThickness: 0, layers: [] }

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
  const topCoilKg = r3(totalM2 * topCoilRate)

  const botCoilRate = botSkin * AL_DENSITY * scrapMult
  const botCoilKg = r3(totalM2 * botCoilRate)

  // Core thickness = total thickness - top skin - bottom skin
  const coreThickMm = Math.max(0, Math.round((totalThick - topSkin - botSkin) * 100) / 100)
  const coreDensity = Number(coreConf.density) || 0.92
  const coreRate = coreConf.uom === 'M2'
    ? 1.0 * scrapMult
    : coreThickMm * coreDensity * scrapMult
  const coreQty = r3(totalM2 * coreRate)

  // Adhesive film: rate per m2 (standard 0.09 - 0.10 kg/m2 for 2 bonding layers)
  const adhRate = Number(coreConf.adh_rate_per_m2 || 0.090) * scrapMult
  const adhKg = r3(totalM2 * adhRate)

  // Masking film: surface area + overlap (standard 1.02 m2/m2)
  const maskRate = Number(coreConf.mask_rate_per_m2 || 1.020) * scrapMult
  const maskM2 = r3(totalM2 * maskRate)

  // Multi-component core blend (if enabled) vs standard single core material
  const isBlend = Boolean(coreConf.blend_enabled && Array.isArray(coreConf.blend_components) && coreConf.blend_components.length > 0)
  const coreLayers = isBlend
    ? coreConf.blend_components.map((comp) => {
        const pct = Number(comp.ratio_pct) || 0
        const name = `${comp.name || 'Core Blend Component'} (${pct}%)`
        return {
          layer_type: 'CORE',
          key: `core-${coreKey}-${comp.material_id || name.replace(/[^a-zA-Z0-9]/g, '_')}`,
          layer_name: name,
          material_id: comp.material_id ? Number(comp.material_id) : null,
          ratio_pct: pct,
          qty: r3(coreQty * (pct / 100)),
          uom: coreConf.uom || 'KG',
          rate_per_m2: r3(coreRate * (pct / 100)),
          scrap_pct: Number(coreConf.scrap_pct || 3.0),
          formula: `${totalM2.toFixed(1)} m² × ${coreRate.toFixed(3)} ${coreConf.uom || 'KG'}/m² × ${pct}%`,
        }
      })
    : [
        {
          layer_type: 'CORE',
          key: `core-${coreKey}`,
          layer_name: `${coreConf.name} (${coreThickMm}mm)`,
          material_id: coreConf.core_material_id,
          match: { kind: 'CORE', coreType: coreKey },
          qty: coreQty,
          uom: coreConf.uom || 'KG',
          rate_per_m2: r3(coreRate),
          scrap_pct: Number(coreConf.scrap_pct || 3.0),
          formula: coreConf.uom === 'M2'
            ? `${totalM2.toFixed(1)} m² × +${coreConf.scrap_pct}%`
            : `${totalM2.toFixed(1)} m² × ${coreThickMm}mm × ${coreDensity} × +${coreConf.scrap_pct}%`,
        },
      ]

  return {
    pieces,
    totalM2: Math.round(totalM2 * 100) / 100,
    m2PerPc: r3(m2PerPc),
    coreKey,
    coreConf,
    topSkin,
    botSkin,
    coreThickMm,
    coreThickness: coreThickMm,
    layers: [
      {
        layer_type: 'TOP_COIL',
        key: `top-${colorCode || 'DEF'}-${topSkin}-${width}`,
        layer_name: `Top Coil ${topSkin.toFixed(2)}mm · ${colorName || colorCode || 'Color'}`,
        match: { kind: 'TOP_COIL', colorCode, thickness: topSkin, width },
        color_code: colorCode,
        color_name: colorName,
        thickness: topSkin,
        width,
        is_coil: true,
        qty: topCoilKg,
        uom: 'KG',
        rate_per_m2: r3(topCoilRate),
        scrap_pct: Number(coreConf.scrap_pct || 3.0),
        formula: `${totalM2.toFixed(1)} m² × ${topSkin}mm × 2.71 × +${coreConf.scrap_pct}%`,
      },
      {
        layer_type: 'BOTTOM_COIL',
        key: `bot-${botSkin}-${width}`,
        layer_name: `Bottom Coil ${botSkin.toFixed(2)}mm · ${width}mm (Service Coat)`,
        match: { kind: 'BOTTOM_COIL', thickness: botSkin, width },
        thickness: botSkin,
        width,
        is_coil: true,
        qty: botCoilKg,
        uom: 'KG',
        rate_per_m2: r3(botCoilRate),
        scrap_pct: Number(coreConf.scrap_pct || 3.0),
        formula: `${totalM2.toFixed(1)} m² × ${botSkin}mm × 2.71 × +${coreConf.scrap_pct}%`,
      },
      ...coreLayers,
      {
        layer_type: 'ADHESIVE_FILM',
        key: `adh-${coreConf.adh_material_id || 'none'}`,
        layer_name: 'Polymer Adhesive Film',
        material_id: coreConf.adh_material_id,
        match: { kind: 'ADHESIVE' },
        qty: adhKg,
        uom: 'KG',
        rate_per_m2: r3(adhRate),
        scrap_pct: Number(coreConf.scrap_pct || 3.0),
        formula: `${totalM2.toFixed(1)} m² × ${coreConf.adh_rate_per_m2} kg/m² × +${coreConf.scrap_pct}%`,
      },
      {
        layer_type: 'MASKING_FILM',
        key: `mask-${coreConf.mask_material_id || 'none'}`,
        layer_name: 'Protective PE Masking Film',
        material_id: coreConf.mask_material_id,
        match: { kind: 'MASKING' },
        qty: maskM2,
        uom: 'M2',
        rate_per_m2: r3(maskRate),
        scrap_pct: Number(coreConf.scrap_pct || 3.0),
        formula: `${totalM2.toFixed(1)} m² × ${coreConf.mask_rate_per_m2} m²/m² × +${coreConf.scrap_pct}%`,
      },
    ],
  }
}

const alnum = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '')

// 4. Match Material from Inventory by Physical Attributes
export function findMatchingMaterial(materials, criteria) {
  if (!materials?.length || !criteria) return null
  const { kind, colorCode, thickness, width } = criteria
  const th = Number(thickness) || 0
  const w = Number(width) || 0

  // 1–2. Coils: same kind, same thickness, wide enough, and for top coils the product's colour; the
  // narrowest such coil wins, SDPE before other coatings. No near-miss guesses: a wrong coil is worse
  // than none (the operator must pick).
  if (kind === 'TOP_COIL' || kind === 'BOTTOM_COIL') {
    const color = String(colorCode || '').trim().toUpperCase()
    if (kind === 'TOP_COIL' && !color) return null
    const fits = materials.filter((m) => m.kind === kind
      && (kind === 'BOTTOM_COIL' || String(m.color_code || '').trim().toUpperCase() === color)
      && Math.abs(Number(m.thickness) - th) < 0.005
      && (!w || Number(m.width) >= w))
    const notSdpe = (m) => (/SDPE/i.test(`${m.code} ${m.name}`) ? 0 : 1)
    return fits.sort((x, y) => Number(x.width) - Number(y.width) || notSdpe(x) - notSdpe(y))[0] || null
  }

  // Standard core components are named in the BOM: match the name ignoring punctuation.
  if (kind === 'NAMED') {
    const want = alnum(criteria.name)
    return materials.find((m) => alnum(m.name) === want || alnum(m.code) === want) || null
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

  // 4. Adhesive film (the standard asks for an exact gauge and width)
  if (kind === 'ADHESIVE') {
    if (th) return materials.find((m) => m.kind === 'ADHESIVE' && Math.abs(Number(m.thickness) - th) < 0.0005 && Number(m.width) === w) || null
    const match = materials.find((m) => m.kind === 'ADHESIVE' || m.code?.includes('ADH') || m.name?.toLowerCase().includes('adhesive'))
    if (match) return match
  }

  // 5. Masking film (the standard asks for brand, level by colour, and width)
  if (kind === 'MASKING') {
    if (w) {
      if (!criteria.level || !criteria.brand) return null
      return materials.find((m) => {
        const txt = String(m.name || m.code || '').toUpperCase()
        return m.kind === 'MASKING' && Number(m.width) === w && txt.includes(criteria.brand) && txt.endsWith(`-${criteria.level}`)
      }) || null
    }
    const match = materials.find((m) => m.kind === 'MASKING' || m.name?.toLowerCase().includes('protective') || m.name?.toLowerCase().includes('masking'))
    if (match) return match
  }

  return null
}

// 5. Aggregate requirements for a shift or plan (several products): one row per material spec, in layer order.
// Waste lines come back separately on rows.waste (they are output, not material to issue).
const LAYER_ORDER = ['TOP_COIL', 'BOTTOM_COIL', 'CORE', 'ADHESIVE_FILM', 'MASKING_FILM']
const r1 = (n) => Math.round(n * 10) / 10
export function calcDprBOM(productionItems, coreSettingsList, materials = []) {
  const settingsMap = Array.isArray(coreSettingsList)
    ? Object.fromEntries(coreSettingsList.map((s) => [s.core_type, s]))
    : (coreSettingsList || DEFAULT_CORE_SETTINGS)

  const sums = new Map()
  const waste = new Map()
  const missingCores = new Set()

  for (const item of (productionItems || [])) {
    const good = Number(item.good_qty || item.good || 0)
    const rej = Number(item.rejected_qty || item.rejected || 0)
    const totalPcs = good + rej
    if (totalPcs <= 0) continue

    const spec = item.fg_item || item.item_spec || item
    const bom = calcPanelBOM(spec, totalPcs, settingsMap)
    if (bom.missingCore) missingCores.add(bom.coreKey || '(blank)')
    for (const layer of bom.layers) {
      const map = layer.layer_type === 'WASTE' ? waste : sums
      if (!map.has(layer.key)) map.set(layer.key, { ...layer, qty: 0 })
      map.get(layer.key).qty += layer.qty
    }
  }

  const rows = [...sums.values()]
    .sort((a, b) => LAYER_ORDER.indexOf(a.layer_type) - LAYER_ORDER.indexOf(b.layer_type))
    .map((l) => {
      const mat = l.material_id ? materials.find((m) => m.id === l.material_id) : findMatchingMaterial(materials, l.match)
      return {
        key: l.key,
        layer_type: l.layer_type,
        layer_name: l.layer_name,
        material_id: mat?.id || l.material_id || null,
        suggested_mat_id: mat?.id || l.material_id || null,
        material_name: mat?.name || l.layer_name,
        material_code: mat?.code || '—',
        color_code: l.color_code,
        system_qty: r1(l.qty),
        actual_qty: r1(l.qty),
        uom: l.uom,
        scrap_pct: l.scrap_pct,
        is_coil: Boolean(l.is_coil),
      }
    })

  // ponytail: list extras on the array so callers that only want rows keep working.
  rows.missingCores = [...missingCores]
  rows.waste = [...waste.values()].map((l) => ({ key: l.key, layer_name: l.layer_name, qty: r1(l.qty), uom: l.uom }))
  return rows
}
