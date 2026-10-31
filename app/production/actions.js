'use server'
import { redirect } from 'next/navigation'
import { db, go, logEvent, requireRole } from '@/lib/server'
import { invError, invMasters } from '@/lib/inventory'
import { parseCSV } from '@/lib/csv'
import { calcDprBOM, normalizeCore, standardFor } from '@/lib/bom'
import { listCoreSettings } from '@/lib/bom-server'
import { plural, qty as fmt, today } from '@/lib/tas'

// Phase 2 (FG side): admin and manager. Form actions return { error } so typed values stay; the rest redirect.
const str = (fd, k) => String(fd.get(k) || '').trim()
const num = (v) => (String(v ?? '').trim() === '' ? NaN : Number(v))
const dateOf = (fd) => {
  const d = str(fd, 'date') || today()
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null
}
const done = (path, msg) => redirect(`${path}${path.includes('?') ? '&' : '?'}ok=${encodeURIComponent(msg)}`)
const err = (e) => ({ error: invError(e).replace('migrate-015', 'migrate-017') })

// Planning board: one plan for a date + shift + line, from the qty_<fg item> inputs that are above 0.
export async function createPlan(_prev, fd) {
  const me = await requireRole('manager')
  const date = dateOf(fd)
  if (!date) return { error: 'Pick the plan date.' }
  if (!str(fd, 'line')) return { error: 'Pick the production line.' }
  const lines = fd.getAll('item').map((id) => ({ item: Number(id), qty: num(fd.get(`qty_${id}`)) })).filter((l) => l.qty)
  if (lines.some((l) => !(l.qty > 0) || !Number.isInteger(l.qty))) return { error: 'Planned pieces must be whole numbers above 0.' }
  if (!lines.length) return { error: 'Enter the pieces to make on at least one item.' }
  const { data: no, error } = await db().rpc('create_plan', {
    p_head: { date, shift: str(fd, 'shift'), line: str(fd, 'line'), notes: str(fd, 'notes'), by: me.full_name }, p_lines: lines,
  })
  if (error) return err(error)
  const { data: p } = await db().from('production_plans').select('id').eq('plan_no', no).single()
  await logEvent(null, me, 'Production planned', `${no} · ${plural(lines.length, 'item')} · ${fmt(lines.reduce((n, l) => n + l.qty, 0))} pcs`)
  done(`/production/plan/${p.id}`, `${no} created.`)
}

// Production entry: rows item / plan_item / good_<i> / rejected_<i> / reason_<i>; RM consumption = system + actual + reason.
export async function createProduction(_prev, fd) {
  const me = await requireRole('manager')
  const date = dateOf(fd)
  if (!date || date > today()) return { error: 'Pick the production date, not in the future.' }
  if (!str(fd, 'line')) return { error: 'Pick the production line.' }
  const keys = fd.getAll('row')
  const items = keys.map((k) => ({
    item: Number(fd.get(`item_${k}`)) || null, plan_item: str(fd, `plan_item_${k}`), good: num(fd.get(`good_${k}`) || 0),
    rejected: num(fd.get(`rejected_${k}`) || 0), reason: str(fd, `reason_${k}`),
  })).filter((r) => r.item && (r.good || r.rejected))
  for (const r of items) {
    if (!(r.good >= 0 && r.rejected >= 0) || !Number.isInteger(r.good) || !Number.isInteger(r.rejected)) return { error: 'Pieces must be whole numbers, 0 or more.' }
    if (r.rejected > 0 && !r.reason) return { error: 'Give the reason on every row with rejected pieces.' }
  }
  if (!items.length) return { error: 'Enter the good or rejected pieces of at least one item.' }

  // RM consumption. The system figures are worked out again here from the pieces, the standard BOM and
  // the saved core settings, so the form can only send the actual figures, the material picked and the reasons.
  const { data: specs, error: specErr } = await db().from('fg_items')
    .select('id, brand, grade, width, length, thickness, skin, core, color_code, color_name').in('id', items.map((r) => r.item))
  if (specErr) return err(specErr)
  const { settings } = await listCoreSettings()
  const sys = calcDprBOM(items.map((r) => ({ fg_item: specs.find((f) => f.id === r.item) || {}, good_qty: r.good, rejected_qty: r.rejected })), settings, [])
  if (sys.missingCores.length) return { error: `No BOM settings for core type ${sys.missingCores.join(', ')}. Add it on the BOM page first.` }
  // The settings each row was worked out with, so later edits to a density or scrap % don't rewrite history.
  // Products in the standard BOM don't use the core settings; they are listed under STANDARD instead.
  const std = [...new Set(specs.map((f) => standardFor(f)).filter(Boolean).map((s) => `${s.grade}${s.core === 'FRB1' ? '-FRB1' : ''}`))]
  const cores = new Set(specs.filter((f) => !standardFor(f)).map((f) => normalizeCore(f.core)))
  const snapshot = Object.fromEntries(settings.filter((c) => cores.has(c.core_type))
    .map((c) => [c.core_type, { density: c.density, scrap_pct: c.scrap_pct, adh_rate_per_m2: c.adh_rate_per_m2, mask_rate_per_m2: c.mask_rate_per_m2, bottom_skin_mode: c.bottom_skin_mode }]))
  if (std.length) snapshot.STANDARD = { source: 'All_Finished_Goods_BOM.xlsx (31 Oct 2026)', grades: std }

  const cKeys = fd.getAll('consumption_row')
  const sent = new Set(cKeys)
  if (sys.some((r) => !sent.has(r.key))) return { error: 'The material list is out of date. Change any piece count to refresh it, then save again.' }
  const consumption = []
  for (const k of cKeys) {
    const s0 = sys.find((r) => r.key === k) // undefined = an extra material added by hand
    const c = {
      layer_type: s0?.layer_type || 'OTHER',
      material_id: Number(fd.get(`c_material_${k}`)) || null,
      suggested_mat_id: s0 ? Number(fd.get(`c_suggested_${k}`)) || null : null,
      system_qty: s0?.system_qty || 0,
      actual_qty: num(fd.get(`c_actual_${k}`) || 0),
      uom: s0?.uom || str(fd, `c_uom_${k}`) || 'KG',
      reason: str(fd, `c_reason_${k}`),
      settings_snapshot: snapshot,
    }
    const label = s0?.layer_name || 'the extra material line'
    if (!(c.actual_qty >= 0)) return { error: `Actual used on ${label} must be 0 or more.` }
    if (!c.system_qty && !c.actual_qty) continue
    if (!c.material_id) return { error: `Pick the material for ${label}.` }
    const diffPct = c.system_qty > 0 ? Math.abs(c.actual_qty - c.system_qty) / c.system_qty * 100 : 100
    if (diffPct > 5 && !c.reason) {
      return { error: c.system_qty > 0 ? `Give the reason on ${label}: actual is ${diffPct.toFixed(1)}% off the BOM.` : 'Give the reason for each extra material line.' }
    }
    consumption.push(c)
  }

  // Fallback to legacy usage if consumption not provided
  const usage = fd.getAll('material').map((m, i) => ({ material: Number(m), qty: num(fd.getAll('qty')[i]) })).filter((u) => u.material)
  if (usage.some((u) => !(u.qty > 0))) {
    return { error: 'RM used must be above 0 on every material line (remove empty lines).' }
  }

  // Any shortfall on the line is issued from the plant's RM store inside create_production (migrate-020),
  // in the same transaction: if the entry fails, the issue is undone too.
  const { data: no, error } = await db().rpc('create_production', {
    p_head: { date, shift: str(fd, 'shift'), line: str(fd, 'line'), plan: str(fd, 'plan'), operator: str(fd, 'operator'), notes: str(fd, 'notes'), by: me.full_name },
    p_items: items,
    p_usage: usage,
    p_consumption: consumption,
  })
  if (error) return err(error)
  const { data: p } = await db().from('productions').select('id').eq('dpr_no', no).single()
  const { data: autoIss } = await db().from('transfers').select('doc_no').eq('notes', `Auto-issued for DPR ${no}`).maybeSingle()
  if (autoIss) await logEvent(null, me, 'Material auto-issued', `${autoIss.doc_no} · issued to the line for ${no}`)
  const good = items.reduce((n, r) => n + r.good, 0)
  await logEvent(null, me, 'Production entered', `${no} · ${fmt(good)} good, ${fmt(items.reduce((n, r) => n + r.rejected, 0))} rejected pcs`)
  done(`/production/dpr/${p.id}`, `${no} saved. The good pieces now wait for FG QC.`)
}

// FG QC rows: row = production_items id; pass_ / b_ / reject_ / reason_. Rows left blank are skipped.
export async function qcProduction(_prev, fd) {
  const me = await requireRole('manager')
  const lines = fd.getAll('row').map((id) => ({
    id: Number(id), pass: num(fd.get(`pass_${id}`) || 0), b: num(fd.get(`b_${id}`) || 0), reject: num(fd.get(`reject_${id}`) || 0), reason: str(fd, `reason_${id}`),
  })).filter((l) => l.pass || l.b || l.reject)
  if (!lines.length) return { error: 'Fill in at least one row (pass, B-grade or reject).' }
  if (lines.some((l) => l.reject > 0 && !l.reason)) return { error: 'Give the reason on every row with rejected pieces.' }
  const { error } = await db().rpc('qc_production', { p_lines: lines, p_by: me.full_name })
  if (error) return err(error)
  const t = (k) => fmt(lines.reduce((n, l) => n + l[k], 0))
  await logEvent(null, me, 'FG QC done', `${plural(lines.length, 'row')} · ${t('pass')} pass, ${t('b')} B-grade, ${t('reject')} rejected`)
  done('/production/qc', `QC saved: ${t('pass')} pcs into FG stock${lines.some((l) => l.b) ? `, ${t('b')} as B-grade` : ''}.`)
}

// FG adjustment (stock count correction), from LinesForm: material = FG item id, qty = ± pieces.
export async function postFgAdjustment(_prev, fd) {
  const me = await requireRole('manager')
  const date = dateOf(fd)
  if (!date || date > today()) return { error: 'Pick the date, not in the future.' }
  const store = Number(str(fd, 'store'))
  const reason = str(fd, 'reason')
  if (!store) return { error: 'Pick the FG store.' }
  if (!reason) return { error: 'Give the reason.' }
  const items = fd.getAll('material')
  const qtys = fd.getAll('qty').map(num)
  if (qtys.some((q) => !q || !Number.isInteger(q))) return { error: 'Pieces must be whole numbers other than 0.' }
  const { data: no, error } = await db().rpc('post_fg_adjustment', {
    p_type: 'ADJUST', p_date: date, p_by: me.full_name, p_lines: items.map((item, i) => ({ store, item: Number(item), qty: qtys[i], note: reason })),
  })
  if (error) return err(error)
  await logEvent(null, me, 'FG stock adjusted', `${no} · ${plural(items.length, 'line')} · ${reason}`)
  done('/production/fg', `${no} posted.`)
}

// FG opening stock from Excel (CSV): store_code, brand, grade, color_code, color_name, core, skin, width, length,
// thickness, pcs. Items are found or made from the attributes, as for order lines. Once per store + item.
const FG_COLS = ['store_code', 'brand', 'grade', 'color_code', 'color_name', 'core', 'skin', 'width', 'length', 'thickness', 'pcs']
export async function importFgOpening(fd) {
  const me = await requireRole('manager')
  const P = '/production/fg'
  const date = dateOf(fd)
  if (!date || date > today()) go(P, 'error', 'Pick the opening date, not in the future.')
  const file = fd.get('file')
  if (!file?.size) go(P, 'error', 'Choose a CSV file first.')
  const rows = parseCSV(await file.text())
  if (!rows.length) go(P, 'error', 'That file has no rows under the header.')
  const missing = FG_COLS.filter((h) => !(h in rows[0]))
  if (missing.length) go(P, 'error', `Missing columns: ${missing.join(', ')}.`)
  const { stores } = await invMasters()
  const fg = Object.fromEntries(stores.filter((s) => s.type === 'FG').map((s) => [s.code.toUpperCase(), s.id]))
  const n = (v) => (v === '' ? null : Number(String(v).replace(/,/g, '')))
  const lines = []
  for (const [i, r] of rows.entries()) {
    const rawPcs = String(r.pcs || '').trim().replace(/,/g, '')
    if (!rawPcs || rawPcs === '0') continue // Skip empty or zero template rows
    const store = fg[r.store_code?.toUpperCase()]
    if (!store) go(P, 'error', `Row ${i + 2}: no FG store with code "${r.store_code}".`)
    const pcs = n(rawPcs)
    if (!(pcs > 0) || !Number.isInteger(pcs)) go(P, 'error', `Row ${i + 2}: pcs "${r.pcs}" must be a whole number above 0.`)
    for (const k of ['skin', 'width', 'length', 'thickness']) if (r[k] !== '' && !(n(r[k]) > 0)) go(P, 'error', `Row ${i + 2}: ${k} "${r[k]}" is not a number.`)
    if (!r.brand) go(P, 'error', `Row ${i + 2}: brand is required.`)
    lines.push({
      store, qty: pcs, note: file.name, brand: r.brand, grade: r.grade || null, color_code: r.color_code || null, color_name: r.color_name || null,
      core: r.core || null, skin: n(r.skin), width: n(r.width), length: n(r.length), thickness: n(r.thickness),
    })
  }
  if (!lines.length) go(P, 'error', 'No products with pcs > 0 were found in the file. Enter piece counts for the items you have in stock.')
  const { data: no, error } = await db().rpc('post_fg_adjustment', { p_type: 'OPENING', p_date: date, p_lines: lines, p_by: me.full_name })
  if (error) go(P, 'error', err(error).error)
  await logEvent(null, me, 'FG opening stock loaded', `${no} · ${plural(lines.length, 'line')} · ${fmt(lines.reduce((s, l) => s + l.qty, 0))} pcs · ${file.name}`)
  done(P, `${no}: FG opening stock loaded for ${plural(lines.length, 'line')}.`)
}

// Find or create an FG item on the fly for custom specs or Make-to-Stock.
export async function getOrCreateFgItem(input) {
  await requireRole('manager')
  const brand = String(input.brand || '').trim()
  const grade = String(input.grade || '').trim()
  const color_code = String(input.color_code || '').trim()
  const color_name = String(input.color_name || '').trim()
  const core = String(input.core || '').trim()
  const skin = input.skin != null && input.skin !== '' ? num(input.skin) : null
  const width = num(input.width)
  const length = num(input.length)
  const thickness = num(input.thickness)

  if (!brand) return { error: 'Brand is required.' }
  if (!(width > 0)) return { error: 'Width must be greater than 0.' }
  if (!(length > 0)) return { error: 'Length must be greater than 0.' }
  if (!(thickness > 0)) return { error: 'Thickness must be greater than 0.' }

  const { data: id, error } = await db().rpc('fg_item_for', {
    p_brand: brand,
    p_grade: grade || null,
    p_color: color_code || null,
    p_color_name: color_name || null,
    p_core: core || null,
    p_skin: Number.isFinite(skin) ? skin : null,
    p_width: width,
    p_length: length,
    p_thickness: thickness,
    p_b: false,
  })
  if (error) return err(error)

  const { data: item, error: fetchErr } = await db()
    .from('fg_items')
    .select('id, code, brand, grade, color_code, color_name, core, skin, width, length, thickness, b_grade, m2_per_pc')
    .eq('id', id)
    .single()

  if (fetchErr) return err(fetchErr)
  return { item }
}

// Auto-issue a plan's raw material from the plant's RM store to its line. The BOM (calcDprBOM)
// gives the quantities; auto_issue_plan (migrate-020) moves only the shortfall, in one transaction.
// Called from a plain form, so every outcome redirects with a toast (a returned { error } would be lost).
export async function autoIssuePlan(planId) {
  const me = await requireRole('manager')
  const back = `/production?view=${planId}`
  const { data: plan } = await db().from('production_plans')
    .select('id, plan_no, line:stores(name), items:plan_items(qty, f:fg_items(*))')
    .eq('id', planId).maybeSingle()
  if (!plan) go('/production', 'error', 'Plan not found.')

  const { settings } = await listCoreSettings()
  // invMasters reads every material: a plain select stops at Supabase's 1,000 rows (there are 2,000+).
  const { materials } = await invMasters()
  const bom = calcDprBOM(
    (plan.items || []).filter((i) => i.f && Number(i.qty) > 0).map((i) => ({ fg_item: i.f, good_qty: Number(i.qty) })),
    settings, materials,
  )
  if (bom.missingCores?.length) go(back, 'error', `No BOM settings for core type ${bom.missingCores.join(', ')}. Add it on the BOM page first.`)
  // Refuse rather than issue part of the plan's material without saying so.
  const unmatched = bom.filter((r) => !r.material_id && r.system_qty > 0).map((r) => r.layer_name)
  if (unmatched.length) go(back, 'error', `No material in Materials for: ${unmatched.join(', ')}. Add it under Materials, or issue this plan by hand.`)
  const lines = bom.filter((r) => r.material_id && r.system_qty > 0).map((r) => ({ material: r.material_id, qty: r.system_qty }))
  if (!lines.length) go(back, 'error', 'No raw material could be matched to this plan. Check the BOM settings and materials.')

  const { data: no, error } = await db().rpc('auto_issue_plan', { p_plan_id: plan.id, p_lines: lines, p_by: me.full_name })
  if (error) go(back, 'error', `Auto-issue failed: ${invError(error)}`)
  if (no === 'ALREADY_STOCKED') go(back, 'ok', 'The line already has the raw material for this plan.')
  await logEvent(null, me, 'Material auto-issued', `${no} · auto-issued to ${plan.line?.name} for ${plan.plan_no}`)
  go(back, 'ok', `${no}: raw material issued to ${plan.line?.name}.`)
}
