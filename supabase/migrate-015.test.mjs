// Runs migrate-015 on an in-memory Postgres (PGlite) and walks PO -> GRN -> QC -> issue -> adjust -> report: npm run test:sql
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const db = new PGlite()
await db.exec('create role anon; create role authenticated;')
await db.exec(readFileSync(new URL('./migrate-015.sql', import.meta.url), 'utf8'))
const one = async (sql, p = []) => (await db.query(sql, p)).rows[0]
const fails = async (sql, p, re) => {
  try { await db.query(sql, p) } catch (e) { assert.match(e.message, re); return }
  assert.fail(`expected failure: ${sql}`)
}
const j = JSON.stringify

await db.exec(`
  insert into plants (code, name) values ('KHJ', 'Al Kharj');
  insert into stores (plant_code, code, name, type) values ('KHJ', 'KHJ-RM', 'RM Store', 'RM'), ('KHJ', 'KHJ-L1', 'Line 1', 'WIP');
  insert into materials (code, name, min_level) values ('RM001', 'PE coil', 100), ('RM002', 'Bottom coil', null);
  insert into vendors (code, name) values ('V1', 'Coil Co');
`)

// PO
const po = (await one(`select create_po($1, $2) n`, [j({ date: '2026-10-27', plant: 'KHJ', vendor: 1, by: 'Mgr' }), j([{ material: 1, qty: 1000, rate: 5 }, { material: 2, qty: 50 }])])).n
assert.equal(po, 'PO-2026-001')
assert.equal((await one(`select create_po($1, $2) n`, [j({ date: '2026-10-27', plant: 'KHJ', vendor: 1, by: 'Mgr' }), j([{ material: 1, qty: 1 }])])).n, 'PO-2026-002')
await fails(`select create_po($1, $2)`, [j({ date: '2026-10-27', plant: 'KHJ', vendor: 99 }), '[]'], /Pick a vendor/)

// GRN needs an approved PO
const grn = (h, l) => db.query(`select create_grn($1, $2) n`, [j(h), j(l)])
await fails(`select create_grn($1, $2)`, [j({ po: 1, store: 1, date: '2026-10-27' }), j([{ po_item: 1, qty: 10 }])], /approved/)
await db.exec(`update purchase_orders set status = 'APPROVED' where id = 1`)
await fails(`select create_grn($1, $2)`, [j({ po: 1, store: 1, date: '2026-10-27' }), j([{ po_item: 1, qty: 1021 }])], /2% over/)
await fails(`select create_grn($1, $2)`, [j({ po: 1, store: 1, date: '2026-10-27' }), j([{ po_item: 3, qty: 1 }])], /2% over/) // line of another PO
const g1 = (await grn({ po: 1, store: 1, date: '2026-10-27', invoice_no: 'INV1', by: 'Mgr' }, [{ po_item: 1, qty: 1020 }, { po_item: 2, qty: 50 }])).rows[0].n
assert.equal(g1, 'GRN-2026-001')
assert.equal(Number((await one(`select pending_qty from po_items where id = 1`)).pending_qty), -20)
assert.equal((await one(`select count(*)::int n from stock_moves`)).n, 0) // nothing in stock before QC

// QC: reject 20 of the PE coil -> 1000 accepted, PO line pending back to 0; PO closes itself.
await fails(`select qc_grn(1, $1, 'QC')`, [j([{ id: 1, rejected: 0 }])], /between 0/) // line 2 missing
await db.query(`select qc_grn(1, $1, 'QC')`, [j([{ id: 1, rejected: 20, remarks: 'dent' }, { id: 2, rejected: 0 }])])
await fails(`select qc_grn(1, $1, 'QC')`, [j([{ id: 1, rejected: 0 }, { id: 2, rejected: 0 }])], /already/)
assert.equal(Number((await one(`select sum(qty) s from stock_moves where material_id = 1`)).s), 1000)
assert.equal((await one(`select status from purchase_orders where id = 1`)).status, 'CLOSED')

// Issue to line: 300 OK, then 800 more is too much
const tr = (lines) => db.query(`select create_transfer($1, $2) n`, [j({ from: 1, to: 2, date: '2026-10-28', by: 'Mgr' }), j(lines)])
assert.equal((await tr([{ material: 1, qty: 300 }])).rows[0].n, 'ISS-2026-001')
await fails(`select create_transfer($1, $2)`, [j({ from: 1, to: 2, date: '2026-10-28' }), j([{ material: 1, qty: 800 }])], /Not enough RM001 in RM Store: 100 KG short/)
assert.equal((await one(`select count(*)::int n from transfers`)).n, 1) // failed one rolled back

// Opening + adjustment
await fails(`select post_adjustment('OPENING', '2026-10-01', $1, 'A')`, [j([{ store: 1, material: 1, qty: 5 }])], /already has stock/)
assert.match((await one(`select post_adjustment('OPENING', '2026-10-01', $1, 'A') n`, [j([{ store: 2, material: 2, qty: 10 }])])).n, /^OPN-2026-001$/)
await fails(`select post_adjustment('ADJUST', '2026-10-28', $1, 'A')`, [j([{ store: 2, material: 2, qty: -11 }])], /Not enough/)
await db.query(`select post_adjustment('ADJUST', '2026-10-28', $1, 'A')`, [j([{ store: 2, material: 2, qty: -4, note: 'count' }])])

// Report for 27–28 Oct: opening counts the 1 Oct opening stock
const rows = (await db.query(`select * from stock_summary('2026-10-27', '2026-10-28') order by store_id, material_id`)).rows
  .map((r) => [r.store, r.code, +r.opening, +r.inward, +r.outward, +r.closing])
assert.deepEqual(rows, [
  ['RM Store', 'RM001', 0, 1000, 300, 700],
  ['RM Store', 'RM002', 0, 50, 0, 50],
  ['Line 1', 'RM001', 0, 300, 0, 300],
  ['Line 1', 'RM002', 10, 0, 4, 6],
])
// Up to 27 Oct only: the issue on the 28th is not in it
assert.deepEqual((await db.query(`select code, closing from stock_summary('2026-10-01', '2026-10-27', 'KHJ', 1)`)).rows.map((r) => [r.code, +r.closing]), [['RM001', 1000], ['RM002', 50]])
console.log('migrate-015: all checks passed')
