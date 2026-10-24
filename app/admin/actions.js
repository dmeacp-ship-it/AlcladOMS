'use server'
import { revalidatePath } from 'next/cache'
import { db, go, logEvent, requireRole } from '@/lib/server'
import { parseCSV } from '@/lib/csv'
import { DEFAULTS, getSettings } from '@/lib/settings'
import { ITEM_LISTS, MASTERS, ROLES } from '@/lib/tas'

const str = (fd, k) => String(fd.get(k) || '').trim()
// Back to the list page the dialog was opened from (keeps its search and paging).
const back = (fd, table) => {
  const b = str(fd, 'back')
  return b.startsWith(`/admin/${table}`) ? b : `/admin/${table}`
}

// Optional sign-in name (see login): stored lowercase, unique.
function username(fd) {
  const u = str(fd, 'username').toLowerCase()
  if (u && !/^[a-z0-9._-]{3,30}$/.test(u)) go('/admin/users', 'error', 'Username: 3–30 letters, numbers, dots, dashes or underscores.')
  return u || null
}
const taken = (e) => (e.code === '23505' && /username/.test(e.message) ? 'That username is already taken.' : e.message)

export async function createUser(fd) {
  const me = await requireRole('admin')
  const email = str(fd, 'email').toLowerCase()
  const uname = username(fd)
  const password = String(fd.get('password') || '')
  const role = str(fd, 'role')
  if (!ROLES.includes(role)) go('/admin/users', 'error', 'Pick a role.')
  if (password.length < 8) go('/admin/users', 'error', 'Password must be at least 8 characters.')

  // email_confirm: the admin vouches for the account, so no verification email is sent.
  const { data, error } = await db().auth.admin.createUser({ email, password, email_confirm: true })
  if (error) go('/admin/users', 'error', error.message)
  const { error: e2 } = await db().from('profiles').insert({
    id: data.user.id, email, username: uname, role, full_name: str(fd, 'full_name'), mobile: str(fd, 'mobile') || null,
  })
  if (e2) {
    await db().auth.admin.deleteUser(data.user.id)
    go('/admin/users', 'error', taken(e2))
  }
  await logEvent(null, me, 'User created', `${str(fd, 'full_name')} (${email}) · ${role}`)
  go('/admin/users', 'ok', `User ${email} created.`)
}

// Ends every session of a user, on all devices; they must sign in again.
const endSessions = (id) => db().rpc('sign_out_user', { p_user: id })

export async function signOutUser(fd) {
  const me = await requireRole('admin')
  const id = str(fd, 'id')
  const { data: u } = await db().from('profiles').select('full_name').eq('id', id).maybeSingle()
  if (!u) go('/admin/users', 'error', 'User not found.')
  const { error } = await endSessions(id)
  if (error) go('/admin/users', 'error', /sign_out_user/.test(error.message) ? 'Run migrate-008.sql in Supabase first.' : error.message)
  await logEvent(null, me, 'User signed out everywhere', u.full_name)
  go('/admin/users', 'ok', `${u.full_name} is signed out on every device.`)
}

export async function updateUser(fd) {
  const me = await requireRole('admin')
  const id = str(fd, 'id')
  const patch = { full_name: str(fd, 'full_name'), username: username(fd), mobile: str(fd, 'mobile') || null, role: str(fd, 'role'), active: fd.get('active') === 'on' }
  if (!ROLES.includes(patch.role)) go('/admin/users', 'error', 'Pick a role.')
  if (id === me.id && (patch.role !== 'admin' || !patch.active)) go('/admin/users', 'error', "You can't remove your own admin access.")
  const password = String(fd.get('password') || '')
  if (password && password.length < 8) go('/admin/users', 'error', 'Password must be at least 8 characters.')

  const { data: before } = await db().from('profiles').select('*').eq('id', id).maybeSingle()
  const { error } = await db().from('profiles').update(patch).eq('id', id)
  if (error) go('/admin/users', 'error', taken(error))
  if (password) {
    const { error: e2 } = await db().auth.admin.updateUserById(id, { password })
    if (e2) go('/admin/users', 'error', e2.message)
  }
  // A new password or a disabled account should not leave old sessions signed in.
  if (password || !patch.active) await endSessions(id)
  const changed = Object.keys(patch).filter((k) => (before?.[k] ?? null) !== (patch[k] ?? null))
  if (password) changed.push('password')
  if (changed.length) await logEvent(null, me, 'User updated', `${patch.full_name}: ${changed.map((k) => (k === 'active' ? (patch.active ? 'enabled' : 'disabled') : k.replace('_', ' '))).join(', ')}`)
  go('/admin/users', 'ok', `${patch.full_name} saved.`)
}

export async function saveMaster(fd) {
  await requireRole('admin')
  const table = str(fd, 'table')
  const cfg = MASTERS[table]
  if (!cfg) go('/orders', 'error', 'Unknown master.')
  const row = Object.fromEntries(cfg.cols.map((c) => [c, str(fd, c) || null]))
  for (const c of cfg.numbers || []) {
    if (row[c] !== null && !(Number(row[c]) >= 0)) go(back(fd, table), 'error', `${c.replace(/_/g, ' ')} must be a number.`)
  }
  if (table === 'customers') row.salesperson_id = str(fd, 'salesperson_id') || null
  const id = str(fd, 'id')
  const { error } = id ? await db().from(table).update(row).eq('id', id) : await db().from(table).insert(row)
  if (error) go(back(fd, table), 'error', error.message)
  go(back(fd, table), 'ok', `${cfg.title.slice(0, -1)} saved.`)
}

export async function deleteMaster(fd) {
  await requireRole('admin')
  const table = str(fd, 'table')
  if (!MASTERS[table]) go('/orders', 'error', 'Unknown master.')
  const { error } = await db().from(table).delete().eq('id', str(fd, 'id'))
  if (error) go(back(fd, table), 'error', error.message)
  go(back(fd, table), 'ok', 'Deleted.')
}

// Settings → Company: company and bank details, documents, VAT, number formats and approval rules.
export async function saveSettings(fd) {
  const me = await requireRole('admin')
  const P = '/admin/settings'
  const cur = await getSettings()
  const lines = (k) => String(fd.get(k) || '').split('\n').map((x) => x.trim()).filter(Boolean)
  const n = (k) => (str(fd, k) === '' ? null : Number(str(fd, k)))
  const data = {
    company: Object.fromEntries(Object.keys(DEFAULTS.company).map((k) => [k, str(fd, `company_${k}`)])),
    quote_terms: lines('quote_terms'),
    pi_terms: lines('pi_terms'),
    vat_pct: n('vat_pct'),
    quote_prefix: str(fd, 'quote_prefix').toUpperCase(),
    quote_digits: n('quote_digits'),
    quote_start: n('quote_start'),
    do_prefix: str(fd, 'do_prefix').toUpperCase(),
    pi_prefix: str(fd, 'pi_prefix').toUpperCase(),
    auto_approve_below: n('auto_approve_below'),
    admin_approval_above: n('admin_approval_above'),
    letterhead_v: cur.letterhead_v,
  }
  if (!data.company.NAME) go(P, 'error', 'Enter the company name.')
  if (!(data.vat_pct >= 0 && data.vat_pct <= 100)) go(P, 'error', 'VAT must be between 0 and 100%.')
  for (const k of ['quote_prefix', 'do_prefix', 'pi_prefix']) {
    if (!/^[A-Z0-9]{1,6}$/.test(data[k])) go(P, 'error', 'Prefixes: 1–6 letters or numbers, no spaces or dashes.')
  }
  if (!(Number.isInteger(data.quote_digits) && data.quote_digits >= 2 && data.quote_digits <= 6)) go(P, 'error', 'Quote number digits must be 2 to 6.')
  if (!(Number.isInteger(data.quote_start) && data.quote_start >= 1)) go(P, 'error', 'Quote starting number must be 1 or more.')
  for (const k of ['auto_approve_below', 'admin_approval_above']) {
    if (data[k] !== null && !(data[k] > 0)) go(P, 'error', 'Approval amounts must be more than 0, or left blank.')
  }
  if (data.auto_approve_below && data.admin_approval_above && data.auto_approve_below >= data.admin_approval_above) {
    go(P, 'error', 'The auto-approve amount must be lower than the admin-approval amount.')
  }

  const row = { id: 1, data, updated_at: new Date().toISOString(), updated_by: me.full_name }
  const file = fd.get('letterhead')
  if (fd.get('letterhead_reset') === 'on') {
    row.letterhead = null
    data.letterhead_v = Date.now()
  } else if (file?.size) {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) go(P, 'error', 'The letterhead must be a PNG, JPG or WebP image.')
    if (file.size > 1024 * 1024) go(P, 'error', 'The letterhead image must be under 1 MB.')
    row.letterhead = `data:${file.type};base64,${Buffer.from(await file.arrayBuffer()).toString('base64')}`
    data.letterhead_v = Date.now()
  }
  const { error } = await db().from('app_settings').upsert(row)
  if (error) go(P, 'error', /app_settings/.test(error.message) ? 'Run migrate-008.sql in Supabase first.' : error.message)

  const NAMES = { company: 'company details', quote_terms: 'quotation terms', pi_terms: 'PI remarks', vat_pct: 'VAT', quote_prefix: 'quote prefix', quote_digits: 'quote digits', quote_start: 'quote start', do_prefix: 'DO prefix', pi_prefix: 'PI prefix', auto_approve_below: 'auto-approve limit', admin_approval_above: 'admin-approval limit', letterhead_v: 'letterhead' }
  const changed = Object.keys(NAMES).filter((k) => JSON.stringify(data[k] ?? null) !== JSON.stringify(cur[k] ?? null)).map((k) => NAMES[k])
  if (changed.length) await logEvent(null, me, 'Settings changed', changed.join(', '))
  revalidatePath('/', 'layout')
  go(P, 'ok', 'Settings saved.')
}

// Customers / Items from Excel (CSV). Headers are the column names, as in the Export file.
// Customers are matched on code (new codes added, existing ones updated); items are added,
// skipping any whose description is already in the master.
export async function importMaster(fd) {
  const me = await requireRole('admin')
  const table = str(fd, 'table')
  const cfg = MASTERS[table]
  if (!cfg) go('/orders', 'error', 'Unknown master.')
  const P = `/admin/${table}`
  const file = fd.get('file')
  if (!file?.size) go(P, 'error', 'Choose a CSV file first.')
  const rows = parseCSV(await file.text()).map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k.replace(/\s+/g, '_'), v])))
  if (!rows.length) go(P, 'error', 'That file has no rows under the header.')
  if (!cfg.cols.some((c) => c in rows[0])) go(P, 'error', `No known columns. Use the headers from Export: ${cfg.cols.join(', ')}.`)

  let people = []
  if (table === 'customers' && 'salesperson' in rows[0]) {
    ;({ data: people } = await db().from('profiles').select('id, full_name, email, username'))
  }
  const out = []
  for (const [i, r] of rows.entries()) {
    const row = Object.fromEntries(cfg.cols.filter((c) => c in r).map((c) => [c, r[c] || null]))
    for (const c of cfg.numbers || []) {
      if (row[c] != null) {
        const v = Number(String(row[c]).replace(/,/g, ''))
        if (!(v >= 0)) go(P, 'error', `Row ${i + 2}: ${c} "${row[c]}" is not a number.`)
        row[c] = v
      }
    }
    for (const c of cfg.required) if (!row[c]) go(P, 'error', `Row ${i + 2}: ${c} is required.`)
    // Every row gets the same columns, so a blank salesperson cell unassigns rather than being skipped.
    if (table === 'customers' && 'salesperson' in r) {
      const k = r.salesperson.toLowerCase()
      const p = k && people.find((x) => [x.full_name, x.email, x.username].some((v) => v?.toLowerCase() === k))
      if (k && !p) go(P, 'error', `Row ${i + 2}: no user called "${r.salesperson}".`)
      row.salesperson_id = p?.id || null
    }
    if (table === 'items' && !row.uom) row.uom = 'M2'
    out.push(row)
  }

  let added = 0
  let skipped = 0
  if (table === 'customers') {
    const codes = new Set()
    for (const [i, r] of out.entries()) {
      if (codes.has(r.code)) go(P, 'error', `Row ${i + 2}: code ${r.code} appears twice in the file.`)
      codes.add(r.code)
    }
    for (let i = 0; i < out.length; i += 500) {
      const { error } = await db().from('customers').upsert(out.slice(i, i + 500), { onConflict: 'code' })
      if (error) go(P, 'error', /name/.test(error.message) ? 'A customer name in the file already belongs to a different code.' : error.message)
    }
    added = out.length
  } else {
    const { data: have } = await db().from('items').select('description').not('description', 'is', null).limit(100000)
    const seen = new Set((have || []).map((x) => x.description))
    const fresh = out.filter((r) => !r.description || !seen.has(r.description) && seen.add(r.description))
    skipped = out.length - fresh.length
    for (let i = 0; i < fresh.length; i += 500) {
      const { error } = await db().from('items').insert(fresh.slice(i, i + 500))
      if (error) go(P, 'error', error.message)
    }
    added = fresh.length
  }
  const what = `${added} ${table === 'customers' ? 'customers added or updated' : 'items added'}${skipped ? `, ${skipped} already in the master` : ''}`
  await logEvent(null, me, `${cfg.title} imported`, `${what} · ${file.name}`)
  revalidatePath('/', 'layout')
  go(P, 'ok', `Imported: ${what}.`)
}

// ── Item master lists (Items page) ──
const ITEMS = '/admin/items'
const listDef = (k) => ITEM_LISTS.find((d) => d.key === k)
const cleanValue = (d, v) => {
  const s = String(v ?? '').trim()
  if (!s) return ''
  if (d.number) {
    const n = Number(s.replace(/,/g, ''))
    if (!(n > 0)) return null
    return String(n)
  }
  return s
}

export async function addItemValue(fd) {
  const me = await requireRole('admin')
  const d = listDef(str(fd, 'list'))
  if (!d) go(ITEMS, 'error', 'Unknown list.')
  const value = cleanValue(d, fd.get('value'))
  if (value === null) go(ITEMS, 'error', `${d.label} must be a number above 0.`)
  if (!value) go(ITEMS, 'error', `Enter a ${d.label.toLowerCase()}.`)
  const name = d.nameHeader ? str(fd, 'name') : null
  if (d.nameHeader && !name) go(ITEMS, 'error', 'Enter the color name too.')
  const { error } = await db().from('item_lists').upsert({ list: d.key, value, name }, { onConflict: 'list,value' })
  if (error) go(ITEMS, 'error', /item_lists/.test(error.message) ? 'Run migrate-010.sql in Supabase first.' : error.message)
  await logEvent(null, me, 'Item list changed', `${d.label}: added ${value}${name ? ` (${name})` : ''}`)
  go(ITEMS, 'ok', `${d.label} ${value} saved.`)
}

export async function deleteItemValue(fd) {
  const me = await requireRole('admin')
  const id = str(fd, 'id')
  const { data: row } = await db().from('item_lists').select('list, value, name').eq('id', id).maybeSingle()
  if (!row) go(ITEMS, 'error', 'Already removed.')
  const { error } = await db().from('item_lists').delete().eq('id', id)
  if (error) go(ITEMS, 'error', error.message)
  await logEvent(null, me, 'Item list changed', `${listDef(row.list)?.label}: removed ${row.value}${row.name ? ` (${row.name})` : ''}`)
  go(ITEMS, 'ok', `${row.value} removed. Existing orders keep it.`)
}

// Upload the whole item master as CSV in the sheet layout: replaces every list with the file's columns.
export async function importItemLists(fd) {
  const me = await requireRole('admin')
  const file = fd.get('file')
  if (!file?.size) go(ITEMS, 'error', 'Choose a CSV file first.')
  const rows = parseCSV(await file.text())
  if (!rows.length) go(ITEMS, 'error', 'That file has no values under the header row.')
  const head = Object.keys(rows[0])
  const missing = ITEM_LISTS.flatMap((d) => [d.header, d.nameHeader].filter(Boolean)).filter((h) => !head.includes(h.toLowerCase()))
  if (missing.length) go(ITEMS, 'error', `Missing columns: ${missing.join(', ')}. Download the template for the right headers.`)

  const out = []
  for (const d of ITEM_LISTS) {
    const seen = new Set()
    for (const [i, r] of rows.entries()) {
      const value = cleanValue(d, r[d.header.toLowerCase()])
      if (value === null) go(ITEMS, 'error', `Row ${i + 2}, ${d.header}: "${r[d.header.toLowerCase()]}" is not a number above 0.`)
      if (!value || seen.has(value)) continue
      const name = d.nameHeader ? r[d.nameHeader.toLowerCase()] || null : null
      if (d.nameHeader && !name) go(ITEMS, 'error', `Row ${i + 2}: color ${value} has no Color Name.`)
      seen.add(value)
      out.push({ list: d.key, value, name })
    }
    if (!seen.size) go(ITEMS, 'error', `The ${d.header} column is empty — every list needs at least one value.`)
  }
  const { error: e1 } = await db().from('item_lists').delete().gt('id', 0)
  if (e1) go(ITEMS, 'error', /item_lists/.test(e1.message) ? 'Run migrate-010.sql in Supabase first.' : e1.message)
  const { error: e2 } = await db().from('item_lists').insert(out)
  if (e2) go(ITEMS, 'error', e2.message)
  const counts = ITEM_LISTS.map((d) => `${out.filter((x) => x.list === d.key).length} ${d.label.toLowerCase()}`).join(', ')
  await logEvent(null, me, 'Item master uploaded', `${counts} · ${file.name}`)
  revalidatePath('/', 'layout')
  go(ITEMS, 'ok', `Item master replaced: ${counts}.`)
}
