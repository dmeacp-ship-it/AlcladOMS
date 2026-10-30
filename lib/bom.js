// BOM (Bill of Materials) & Parametric Recipes for ACP Manufacturing
import { db } from './server'

// Built-in standard parametric recipes for ACP panels
export const DEFAULT_BOMS = [
  {
    id: 'default-4mm-pe',
    code: 'BOM-4MM-PE-025',
    name: 'Standard ACP 4mm · PE Core · 0.25 / 0.20',
    grade: 'PE',
    thickness: 4.0,
    top_skin: 0.25,
    bottom_skin: 0.20,
    core_thick: 3.55,
    description: 'Standard exterior & interior 4mm ACP panel with low-density polyethylene core.',
    is_active: true,
    items: [
      {
        id: 1,
        layer_type: 'TOP_COIL',
        layer_name: 'PVDF Top Aluminum Coil (0.25mm)',
        category: 'RM',
        mat_code: 'COIL-TOP',
        qty_per_m2: 0.678,
        uom: 'KG',
        scrap_pct: 2.0,
        calc_formula: 'Area × 0.25mm × 2.71 kg/m²',
        sort_order: 10,
      },
      {
        id: 2,
        layer_type: 'BOTTOM_COIL',
        layer_name: 'Mill Finish Bottom Coil (0.20mm)',
        category: 'RM',
        mat_code: 'COIL-BOT',
        qty_per_m2: 0.542,
        uom: 'KG',
        scrap_pct: 2.0,
        calc_formula: 'Area × 0.20mm × 2.71 kg/m²',
        sort_order: 20,
      },
      {
        id: 3,
        layer_type: 'CORE',
        layer_name: 'LDPE Core Granules (3.55mm)',
        category: 'GRANULE',
        mat_code: 'LDPE-01',
        qty_per_m2: 3.266,
        uom: 'KG',
        scrap_pct: 3.0,
        calc_formula: 'Area × 3.55mm × 0.92 g/cm³',
        sort_order: 30,
      },
      {
        id: 4,
        layer_type: 'ADHESIVE_FILM',
        layer_name: 'Polymer Adhesive Film (Top+Bottom)',
        category: 'CONSUMABLE',
        mat_code: 'ADH-01',
        qty_per_m2: 0.090,
        uom: 'KG',
        scrap_pct: 1.0,
        calc_formula: '2 bonding layers × ~45g/m²',
        sort_order: 40,
      },
      {
        id: 5,
        layer_type: 'MASKING_FILM',
        layer_name: 'Protective PE Masking Film',
        category: 'CONSUMABLE',
        mat_code: null,
        qty_per_m2: 1.020,
        uom: 'M2',
        scrap_pct: 2.0,
        calc_formula: 'Surface area + edge overlap',
        sort_order: 50,
      },
    ],
  },
  {
    id: 'default-4mm-fr',
    code: 'BOM-4MM-FR-050',
    name: 'Fire-Rated ACP 4mm · FR-B1 Core · 0.50 / 0.50',
    grade: 'FR-B1',
    thickness: 4.0,
    top_skin: 0.50,
    bottom_skin: 0.50,
    core_thick: 3.00,
    description: 'High-specification facade panel meeting civil defense fire retardant requirements.',
    is_active: true,
    items: [
      {
        id: 6,
        layer_type: 'TOP_COIL',
        layer_name: 'PVDF Top Aluminum Coil (0.50mm)',
        category: 'RM',
        mat_code: 'COIL-TOP',
        qty_per_m2: 1.355,
        uom: 'KG',
        scrap_pct: 2.0,
        calc_formula: 'Area × 0.50mm × 2.71 kg/m²',
        sort_order: 10,
      },
      {
        id: 7,
        layer_type: 'BOTTOM_COIL',
        layer_name: 'Service Coated Bottom Coil (0.50mm)',
        category: 'RM',
        mat_code: 'COIL-BOT',
        qty_per_m2: 1.355,
        uom: 'KG',
        scrap_pct: 2.0,
        calc_formula: 'Area × 0.50mm × 2.71 kg/m²',
        sort_order: 20,
      },
      {
        id: 8,
        layer_type: 'CORE',
        layer_name: 'FR-B1 Mineral Flame Core (3.00mm)',
        category: 'GRANULE',
        mat_code: null,
        qty_per_m2: 4.800,
        uom: 'KG',
        scrap_pct: 3.0,
        calc_formula: 'Area × 3.00mm × 1.60 g/cm³',
        sort_order: 30,
      },
      {
        id: 9,
        layer_type: 'ADHESIVE_FILM',
        layer_name: 'High-Bond Adhesive Film',
        category: 'CONSUMABLE',
        mat_code: 'ADH-01',
        qty_per_m2: 0.100,
        uom: 'KG',
        scrap_pct: 1.0,
        calc_formula: '2 heavy bonding layers',
        sort_order: 40,
      },
      {
        id: 10,
        layer_type: 'MASKING_FILM',
        layer_name: 'Protective PE Masking Film (UV)',
        category: 'CONSUMABLE',
        mat_code: null,
        qty_per_m2: 1.020,
        uom: 'M2',
        scrap_pct: 2.0,
        calc_formula: 'Surface area + edge overlap',
        sort_order: 50,
      },
    ],
  },
  {
    id: 'default-3mm-pe',
    code: 'BOM-3MM-PE-020',
    name: 'Signage ACP 3mm · PE Core · 0.20 / 0.20',
    grade: 'PE',
    thickness: 3.0,
    top_skin: 0.20,
    bottom_skin: 0.20,
    core_thick: 2.60,
    description: 'Economical lightweight 3mm panel for digital print, signage and partition work.',
    is_active: true,
    items: [
      {
        id: 11,
        layer_type: 'TOP_COIL',
        layer_name: 'Polyester Top Coil (0.20mm)',
        category: 'RM',
        mat_code: 'COIL-TOP',
        qty_per_m2: 0.542,
        uom: 'KG',
        scrap_pct: 2.0,
        calc_formula: 'Area × 0.20mm × 2.71 kg/m²',
        sort_order: 10,
      },
      {
        id: 12,
        layer_type: 'BOTTOM_COIL',
        layer_name: 'Mill Finish Bottom Coil (0.20mm)',
        category: 'RM',
        mat_code: 'COIL-BOT',
        qty_per_m2: 0.542,
        uom: 'KG',
        scrap_pct: 2.0,
        calc_formula: 'Area × 0.20mm × 2.71 kg/m²',
        sort_order: 20,
      },
      {
        id: 13,
        layer_type: 'CORE',
        layer_name: 'Recycled LDPE Core (2.60mm)',
        category: 'GRANULE',
        mat_code: 'LDPE-01',
        qty_per_m2: 2.392,
        uom: 'KG',
        scrap_pct: 3.0,
        calc_formula: 'Area × 2.60mm × 0.92 g/cm³',
        sort_order: 30,
      },
      {
        id: 14,
        layer_type: 'ADHESIVE_FILM',
        layer_name: 'Polymer Adhesive Film',
        category: 'CONSUMABLE',
        mat_code: 'ADH-01',
        qty_per_m2: 0.080,
        uom: 'KG',
        scrap_pct: 1.0,
        calc_formula: '2 bonding layers',
        sort_order: 40,
      },
      {
        id: 15,
        layer_type: 'MASKING_FILM',
        layer_name: 'Protective PE Masking Film',
        category: 'CONSUMABLE',
        mat_code: null,
        qty_per_m2: 1.020,
        uom: 'M2',
        scrap_pct: 2.0,
        calc_formula: 'Surface area + edge overlap',
        sort_order: 50,
      },
    ],
  },
]

// Fetch all recipes (DB or default fallback)
export async function listBOMs() {
  try {
    const { data, error } = await db()
      .from('boms')
      .select('*, items:bom_items(*, mat:materials(id, code, name, uom))')
      .order('id', { ascending: true })

    if (error || !data?.length) {
      return { boms: DEFAULT_BOMS, isDb: false }
    }
    return { boms: data, isDb: true }
  } catch {
    return { boms: DEFAULT_BOMS, isDb: false }
  }
}

// Find closest matching recipe
export function matchRecipe(boms, { grade, thickness, topSkin, bottomSkin }) {
  if (!boms?.length) return null
  const g = String(grade || 'PE').toUpperCase()
  const th = Number(thickness) || 4.0
  const top = Number(topSkin) || 0.25
  const bot = Number(bottomSkin) || 0.20

  // 1. Exact match
  const exact = boms.find(
    (b) =>
      b.is_active &&
      String(b.grade).toUpperCase() === g &&
      Math.abs(Number(b.thickness) - th) < 0.05 &&
      Math.abs(Number(b.top_skin) - top) < 0.02 &&
      Math.abs(Number(b.bottom_skin) - bot) < 0.02
  )
  if (exact) return exact

  // 2. Grade and thickness match
  const byThick = boms.find(
    (b) =>
      b.is_active &&
      String(b.grade).toUpperCase() === g &&
      Math.abs(Number(b.thickness) - th) < 0.05
  )
  if (byThick) return byThick

  // 3. Grade match
  const byGrade = boms.find((b) => b.is_active && String(b.grade).toUpperCase() === g)
  if (byGrade) return byGrade

  return boms[0]
}

// Calculate material requirements for a given m2 and BOM
export function calculateRecipeNeeds(recipe, m2) {
  const area = Number(m2) || 0
  if (!recipe?.items?.length || area <= 0) return []

  return recipe.items.map((item) => {
    const rate = Number(item.qty_per_m2 || 0)
    const scrapPct = Number(item.scrap_pct || 0)
    const net = area * rate
    const scrap = net * (scrapPct / 100)
    const total = net + scrap

    return {
      id: item.id,
      layer_type: item.layer_type,
      layer_name: item.layer_name,
      category: item.category,
      uom: item.uom || 'KG',
      rate_per_m2: rate,
      scrap_pct: scrapPct,
      net_qty: Math.round(net * 1000) / 1000,
      scrap_qty: Math.round(scrap * 1000) / 1000,
      total_qty: Math.round(total * 1000) / 1000,
      calc_formula: item.calc_formula,
      mat_code: item.mat?.code || item.mat_code || '—',
      mat_name: item.mat?.name || item.layer_name,
    }
  })
}
