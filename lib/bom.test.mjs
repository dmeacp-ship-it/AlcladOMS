import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  calcPanelBOM,
  normalizeCore,
  findMatchingMaterial,
  calcDprBOM,
  DEFAULT_CORE_SETTINGS,
} from './bom.js'

test('normalizeCore maps various formats', () => {
  assert.equal(normalizeCore('PE'), 'NFR')
  assert.equal(normalizeCore('NFR'), 'NFR')
  assert.equal(normalizeCore('FRB1'), 'FRB1')
  assert.equal(normalizeCore('FR-B1'), 'FRB1')
  assert.equal(normalizeCore('FRA2'), 'FRA2')
  assert.equal(normalizeCore('FR-A2'), 'FRA2')
})

test('calcPanelBOM accurately calculates layer weights for 4mm NFR panel', () => {
  const spec = {
    width: 1250,
    length: 3660,
    thickness: 4.0,
    skin: 0.25,
    core: 'NFR',
    color_code: 'AL4001',
    color_name: 'Industrial Ash',
  }
  const res = calcPanelBOM(spec, 100) // 100 pieces
  // Area = 100 * (1250 * 3660 / 1e6) = 457.5 m2
  assert.equal(res.totalM2, 457.5)

  const top = res.layers.find((l) => l.layer_type === 'TOP_COIL')
  const bot = res.layers.find((l) => l.layer_type === 'BOTTOM_COIL')
  const core = res.layers.find((l) => l.layer_type === 'CORE')
  const adh = res.layers.find((l) => l.layer_type === 'ADHESIVE_FILM')
  const mask = res.layers.find((l) => l.layer_type === 'MASKING_FILM')

  // Top coil: 457.5 * 0.25 * 2.71 * 1.03 = ~319.55 kg
  assert.ok(top.qty > 310 && top.qty < 330)
  // Bottom coil: same as top
  assert.equal(bot.qty, top.qty)
  // Core: 457.5 * (4 - 0.5) * 0.92 * 1.03 = ~1515.6 kg
  assert.ok(core.qty > 1450 && core.qty < 1550)
  // Adhesive: 457.5 * 0.09 * 1.03 = ~42.4 kg
  assert.ok(adh.qty > 40 && adh.qty < 45)
  // Masking: 457.5 * 1.02 * 1.03 = ~480.6 m2
  assert.ok(mask.qty > 470 && mask.qty < 490)
})

test('calcDprBOM aggregates shift consumption across multiple products', () => {
  const items = [
    {
      fg_item: { width: 1250, length: 3600, thickness: 4, skin: 0.3, core: 'NFR', color_code: 'AL4001', color_name: 'Industrial Ash' },
      good_qty: 40,
      rejected_qty: 2,
    },
    {
      fg_item: { width: 1250, length: 3600, thickness: 4, skin: 0.3, core: 'NFR', color_code: 'AL4002', color_name: 'Rust Ember' },
      good_qty: 50,
      rejected_qty: 0,
    },
  ]
  const materials = [
    { id: 1, kind: 'TOP_COIL', color_code: 'AL4001', thickness: 0.3, width: 1270, code: 'COIL-AL4001', name: 'Industrial Ash Coil 0.30' },
    { id: 2, kind: 'TOP_COIL', color_code: 'AL4002', thickness: 0.3, width: 1270, code: 'COIL-AL4002', name: 'Rust Ember Coil 0.30' },
    { id: 3, kind: 'BOTTOM_COIL', thickness: 0.3, width: 1270, code: 'COIL-BOT-030', name: 'Bottom Coil 0.30' },
    { id: 4, kind: 'CORE', category: 'GRANULE', code: 'LDPE-01', name: 'LDPE Granules' },
    { id: 5, kind: 'ADHESIVE', code: 'ADH-01', name: 'Adhesive Film' },
    { id: 6, kind: 'MASKING', code: 'MASK-01', name: 'Masking Film' },
  ]

  const dprRows = calcDprBOM(items, DEFAULT_CORE_SETTINGS, materials)
  assert.equal(dprRows.length, 6) // 2 top coils (different colors) + 1 bottom coil + 1 core + 1 adhesive + 1 masking
  assert.equal(dprRows[0].material_id, 1) // AL4001 matched
  assert.equal(dprRows[1].material_id, 2) // AL4002 matched
  assert.equal(dprRows[2].material_id, 3) // Bottom coil matched
})

test('calcDprBOM keeps bottom coils of different thickness apart', () => {
  const items = [
    { fg_item: { width: 1250, length: 2450, thickness: 4, skin: 0.3, core: 'NFR', color_code: 'AL4001' }, good_qty: 10 },
    { fg_item: { width: 1250, length: 2450, thickness: 4, skin: 0.5, core: 'FRB1', color_code: 'AL3003' }, good_qty: 10 },
  ]
  const bots = calcDprBOM(items, DEFAULT_CORE_SETTINGS, []).filter((r) => r.layer_type === 'BOTTOM_COIL')
  assert.deepEqual(bots.map((r) => r.key).sort(), ['bot-0.3-1250', 'bot-0.5-1250'])
  // 10 pcs × 3.0625 m² × skin × 2.71 × 1.03
  assert.equal(bots.find((r) => r.key === 'bot-0.3-1250').system_qty, Math.round(30.625 * 0.3 * 2.71 * 1.03 * 10) / 10)
})

test('calcDprBOM keeps bottom coils of different width apart instead of merging into widest coil', () => {
  const items = [
    { fg_item: { width: 1250, length: 2440, thickness: 4, skin: 0.20, core: 'NFR' }, good_qty: 100 },
    { fg_item: { width: 1500, length: 2440, thickness: 4, skin: 0.20, core: 'NFR' }, good_qty: 50 },
  ]
  const bots = calcDprBOM(items, DEFAULT_CORE_SETTINGS, []).filter((r) => r.layer_type === 'BOTTOM_COIL')
  assert.equal(bots.length, 2)
  assert.deepEqual(bots.map((r) => r.key).sort(), ['bot-0.2-1250', 'bot-0.2-1500'])
})

test('calcDprBOM gives each core its own adhesive film material', () => {
  const settings = {
    NFR: { ...DEFAULT_CORE_SETTINGS.NFR, adh_material_id: 11 },
    FRA2: { ...DEFAULT_CORE_SETTINGS.FRA2, adh_material_id: 12 },
  }
  const items = [
    { fg_item: { width: 1250, length: 2450, thickness: 4, skin: 0.3, core: 'NFR' }, good_qty: 5 },
    { fg_item: { width: 1250, length: 2450, thickness: 4, skin: 0.4, core: 'Mineral' }, good_qty: 5 },
  ]
  const adh = calcDprBOM(items, settings, []).filter((r) => r.layer_type === 'ADHESIVE_FILM')
  assert.deepEqual(adh.map((r) => r.material_id).sort(), [11, 12])
})

test('a core type with no settings is reported, not costed as PE', () => {
  const items = [{ fg_item: { width: 1250, length: 2450, thickness: 4, skin: 0.3, core: 'HONEYCOMB' }, good_qty: 5 }]
  const rows = calcDprBOM(items, DEFAULT_CORE_SETTINGS, [])
  assert.equal(rows.length, 0)
  assert.deepEqual(rows.missingCores, ['HONEYCOMB'])
})

test('coil suggestions need the exact thickness and a real coil, never a near miss or a placeholder', () => {
  const mats = [
    { id: 1, kind: 'TOP_COIL', color_code: 'AL4001', thickness: 0.27, width: 1270 },
    { id: 2, kind: 'TOP_COIL', color_code: 'AL4001', thickness: 0.3, width: 1520 },
    { id: 3, kind: 'TOP_COIL', color_code: 'AL4001', thickness: 0.3, width: 1270 },
    { id: 4, kind: null, code: 'COIL-BOT', thickness: null, width: null },
    { id: 5, kind: 'BOTTOM_COIL', thickness: 0.3, width: 1270 },
  ]
  assert.equal(findMatchingMaterial(mats, { kind: 'TOP_COIL', colorCode: 'AL4001', thickness: 0.3, width: 1250 }).id, 3)
  assert.equal(findMatchingMaterial(mats, { kind: 'TOP_COIL', colorCode: 'AL4001', thickness: 0.3, width: 1500 }).id, 2)
  assert.equal(findMatchingMaterial(mats, { kind: 'TOP_COIL', colorCode: 'AL4001', thickness: 0.5, width: 1250 }), null)
  assert.equal(findMatchingMaterial(mats, { kind: 'BOTTOM_COIL', thickness: 0.3, width: 1250 }).id, 5)
  assert.equal(findMatchingMaterial(mats, { kind: 'BOTTOM_COIL', thickness: 0.4, width: 1250 }), null)
})

test('core blend: splits total core into multi-component formulation (70% LDPE, 25% CaCO3, 5% Desiccant)', () => {
  const blendSettings = {
    ...DEFAULT_CORE_SETTINGS,
    NFR: {
      ...DEFAULT_CORE_SETTINGS.NFR,
      blend_enabled: true,
      blend_components: [
        { material_id: 101, name: 'LDPE Recycled Granule', ratio_pct: 70 },
        { material_id: 102, name: 'Calcium Compound Filler (CaCO3)', ratio_pct: 25 },
        { material_id: 103, name: 'Desiccant Masterbatch', ratio_pct: 5 },
      ],
    },
  }

  const spec = { width: 1250, length: 2440, thickness: 4.0, skin: 0.25, core: 'NFR' }
  const singleRes = calcPanelBOM(spec, 100, DEFAULT_CORE_SETTINGS)
  const singleCore = singleRes.layers.find((l) => l.layer_type === 'CORE')

  const blendRes = calcPanelBOM(spec, 100, blendSettings)
  const blendLayers = blendRes.layers.filter((l) => l.layer_type === 'CORE')

  // Should have 3 core layers
  assert.equal(blendLayers.length, 3)
  assert.equal(blendLayers[0].material_id, 101)
  assert.equal(blendLayers[1].material_id, 102)
  assert.equal(blendLayers[2].material_id, 103)

  // Total weight of the 3 blend components must sum to the single core total
  const sumBlendKg = blendLayers.reduce((sum, l) => sum + l.qty, 0)
  assert.ok(Math.abs(sumBlendKg - singleCore.qty) < 0.1)

  // Proportions: 70%, 25%, 5%
  assert.equal(Math.round(blendLayers[0].qty * 10) / 10, Math.round(singleCore.qty * 0.7 * 10) / 10)
  assert.equal(Math.round(blendLayers[1].qty * 10) / 10, Math.round(singleCore.qty * 0.25 * 10) / 10)
  assert.equal(Math.round(blendLayers[2].qty * 10) / 10, Math.round(singleCore.qty * 0.05 * 10) / 10)

  // In DPR aggregation, generates 3 distinct rows with keys
  const items = [{ fg_item: spec, good_qty: 100 }]
  const dprRows = calcDprBOM(items, blendSettings, [])
  const coreRows = dprRows.filter((r) => r.layer_type === 'CORE')
  assert.equal(coreRows.length, 3)
  assert.deepEqual(coreRows.map((r) => r.key).sort(), ['core-NFR-101', 'core-NFR-102', 'core-NFR-103'])
  assert.deepEqual(coreRows.map((r) => r.material_id).sort(), [101, 102, 103])
})

// Spot rows copied from All_Finished_Goods_BOM.xlsx (per 1 SQM); the full 3,040-item check was run on 31 Oct 2026.
const perSqm = (spec) => {
  const b = calcPanelBOM(spec, 1e9 / (spec.width * spec.length)) // 1000 m²
  return Object.fromEntries(b.layers.map((l) => [l.layer_name, Math.round(l.qty) / 1000]))
}

test('standard: ALCLAD AL4050 FR-B1 1250 wide matches the company BOM', () => {
  const q = perSqm({ brand: 'ALCLAD', grade: 'AL4050', core: 'FRB1', color_code: 'RAL7001H', color_name: 'Silver Grey', width: 1250, length: 6000, thickness: 4, skin: 0.3 })
  assert.deepEqual(q, {
    'RAL7001H-SDPE-0.45*1270-Silver Grey': 1.308,
    'BOTTOM COIL-PE-0.45*1270-Window Grey': 1.267,
    'FR3 GRANULES (FRB1)-FRB1': 4.561,
    'CALCIUM COMPOUND FILLER-CaCO3': 0.851,
    'ADHESIVE FILM-0.05*1280-NORMAL': 0.103,
    'PROTECTIVE FILM-0.08*1260-ALCLAD-MEDIUM': 1.016,
    'PLASTIC WASTE DURING PRODUCTION LDPE': -0.392,
    'SIDE TRIMMED ALUMINIUM': -0.051,
    'PROCESS WASTE ALUMINIUM': -0.005,
  })
})

test('standard: 1500 wide scales coils and film by width; AL4045 runs on 0.35 stock', () => {
  const q = perSqm({ brand: 'ALCLAD', grade: 'AL4050', core: 'FRB1', color_code: 'AL3010', color_name: 'Beige', width: 1500, length: 6000, thickness: 4 })
  assert.equal(q['AL3010-SDPE-0.45*1520-Beige'], 1.304)
  assert.equal(q['PROTECTIVE FILM-0.08*1510-ALCLAD-MEDIUM'], 1.007)
  assert.equal(q['ADHESIVE FILM-0.05*1530-NORMAL'], 0.103)
  const pe = perSqm({ brand: 'ALUMAX', grade: 'AL4045', core: 'NFR', color_code: 'AL4001', color_name: 'Industrial Ash', width: 1250, length: 3600, thickness: 4 })
  assert.equal(pe['BOTTOM COIL-PE-0.35*1270-Window Grey'], 1.074)
  assert.equal(pe['LDPE RECYCLED GRANULE-A'], 3.311)
  assert.equal(pe['PROTECTIVE FILM-0.08*1260-ALUMAX-SUPER HIGH SS10+'], 1.016)
})

test('standard: materials are picked by spec, SDPE first, waste kept off the issue list', () => {
  const mats = [
    { id: 1, kind: 'TOP_COIL', code: 'AL3010-PVDF-0.45*1520-Beige', color_code: 'AL3010', thickness: 0.45, width: 1520 },
    { id: 2, kind: 'TOP_COIL', code: 'AL3010-SDPE-0.45*1520-Beige', color_code: 'AL3010', thickness: 0.45, width: 1520 },
    { id: 3, kind: 'BOTTOM_COIL', thickness: 0.45, width: 1520 },
    { id: 4, kind: 'CORE', name: 'FR3 GRANULES (FRB1)---FRB1' },
    { id: 5, kind: 'OTHER', name: 'CALCIUM COMPOUND FILLER---CaCO3' },
    { id: 6, kind: 'ADHESIVE', thickness: 0.05, width: 1280 },
    { id: 7, kind: 'ADHESIVE', thickness: 0.05, width: 1530 },
    { id: 8, kind: 'MASKING', name: 'PROTECTIVE FILM-ALCLAD-0.080*1510-HIGH', width: 1510 },
    { id: 9, kind: 'MASKING', name: 'PROTECTIVE FILM-ALCLAD-0.080*1510-MEDIUM', width: 1510 },
  ]
  const spec = { brand: 'ALCLAD', grade: 'AL4050', core: 'FRB1', color_code: 'AL3010', width: 1500, length: 2000, thickness: 4 }
  const rows = calcDprBOM([{ fg_item: spec, good_qty: 10 }], DEFAULT_CORE_SETTINGS, mats)
  assert.deepEqual(rows.map((r) => r.material_id), [2, 3, 4, 5, 7, 9])
  assert.equal(rows.waste.length, 3)
  assert.ok(rows.waste.every((w) => w.qty < 0))
})

test('outside the standard (FR-A2, other thickness) falls back to the parametric formula', () => {
  assert.equal(calcPanelBOM({ grade: 'AL4050', core: 'FRA2', width: 1250, length: 2440, thickness: 4 }, 1).standard, undefined)
  assert.equal(calcPanelBOM({ grade: 'AL4050', core: 'NFR', width: 1250, length: 2440, thickness: 3, skin: 0.3 }, 1).standard, undefined)
})
