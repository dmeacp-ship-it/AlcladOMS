// CSV in and out of Excel. Exports start with a UTF-8 BOM so Excel shows Arabic names correctly;
// imports accept what Excel writes with "Save As → CSV UTF-8" (quoted fields, commas, new lines).

const cell = (v) => {
  let s = v === null || v === undefined ? '' : String(v)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// cols: [[header, row => value], ...]
export const toCSV = (rows, cols) =>
  '﻿' + [cols.map(([h]) => cell(h)).join(','), ...rows.map((r) => cols.map(([, f]) => cell(f(r))).join(','))].join('\r\n')

export const csvResponse = (name, csv) =>
  new Response(csv, {
    headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${name}.csv"` },
  })

// Returns rows as objects keyed by the header row (headers trimmed and lowercased).
export function parseCSV(text) {
  const rows = []
  let row = []
  let f = ''
  let q = false
  text = text.replace(/^﻿/, '')
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"' && text[i + 1] === '"') { f += '"'; i++ } else if (c === '"') q = false
      else f += c
    } else if (c === '"') q = true
    else if (c === ',') { row.push(f); f = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(f); rows.push(row); row = []; f = ''
    } else f += c
  }
  if (f || row.length) { row.push(f); rows.push(row) }
  const [head, ...body] = rows.filter((r) => r.some((x) => x.trim()))
  if (!head) return []
  const keys = head.map((h) => h.trim().toLowerCase())
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])))
}

// Item lists <-> the sheet layout: one column per list, values down the column (columns may differ in length).
// lists: { brand: [{ value }], color: [{ value, name }], ... }; defs: ITEM_LISTS.
export function itemListsCSV(lists, defs) {
  const cols = defs.flatMap((d) => (d.nameHeader
    ? [[d.header, (i) => lists[d.key]?.[i]?.value], [d.nameHeader, (i) => lists[d.key]?.[i]?.name]]
    : [[d.header, (i) => lists[d.key]?.[i]?.value]]))
  const n = Math.max(0, ...defs.map((d) => lists[d.key]?.length || 0))
  return toCSV(Array.from({ length: n }, (_, i) => i), cols)
}
