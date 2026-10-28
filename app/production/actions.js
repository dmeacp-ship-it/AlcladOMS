'use server'
import { redirect } from 'next/navigation'
import { db, go, logEvent, requireRole } from '@/lib/server'
import { invError, invMasters } from '@/lib/inventory'
import { parseCSV } from '@/lib/csv'
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

// Production entry: rows item / plan_item / good_<i> / rejected_<i> / reason_<i>; RM used = material + qty lines.
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
  const usage = fd.getAll('material').map((m, i) => ({ material: Number(m), qty: num(fd.getAll('qty')[i]) })).filter((u) => u.material)
  if (usage.some((u) => !(u.qty > 0))) return { error: 'RM used must be above 0 on every material line (remove empty lines).' }
  const { data: no, error } = await db().rpc('create_production', {
    p_head: { date, shift: str(fd, 'shift'), line: str(fd, 'line'), plan: str(fd, 'plan'), operator: str(fd, 'operator'), notes: str(fd, 'notes'), by: me.full_name },
    p_items: items, p_usage: usage,
  })
  if (error) return err(error)
  const { data: p } = await db().from('productions').select('id').eq('dpr_no', no).single()
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
    const store = fg[r.store_code.toUpperCase()]
    if (!store) go(P, 'error', `Row ${i + 2}: no FG store with code "${r.store_code}".`)
    const pcs = n(r.pcs)
    if (!(pcs > 0) || !Number.isInteger(pcs)) go(P, 'error', `Row ${i + 2}: pcs "${r.pcs}" must be a whole number above 0.`)
    for (const k of ['skin', 'width', 'length', 'thickness']) if (r[k] !== '' && !(n(r[k]) > 0)) go(P, 'error', `Row ${i + 2}: ${k} "${r[k]}" is not a number.`)
    if (!r.brand) go(P, 'error', `Row ${i + 2}: brand is required.`)
    lines.push({
      store, qty: pcs, note: file.name, brand: r.brand, grade: r.grade || null, color_code: r.color_code || null, color_name: r.color_name || null,
      core: r.core || null, skin: n(r.skin), width: n(r.width), length: n(r.length), thickness: n(r.thickness),
    })
  }
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
    .select('id, code, color_name, b_grade, m2_per_pc, width, length')
    .eq('id', id)
    .single()

  if (fetchErr) return err(fetchErr)
  return { item }
}

