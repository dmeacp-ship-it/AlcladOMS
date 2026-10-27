// Phase 2 check on an in-memory Postgres (PGlite): schema.sql + every migration, then
// order -> mark ready (FG reservation) -> DO takes FG -> undo puts it back; planning -> production -> FG QC.
// npm run test:sql
import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import assert from 'node:assert/strict'

const dir = new URL('./', import.meta.url)
const db = new PGlite()
// Supabase's own schemas, just enough for schema.sql and the migrations to load.
await db.exec(`
  create role anon; create role authenticated;
  create schema auth; create table auth.users (id uuid primary key, last_sign_in_at timestamptz, encrypted_password text);
  create table auth.sessions (user_id uuid);
  create schema storage; create table storage.buckets (id text primary key, name text, public boolean);
  create table storage.objects (metadata jsonb);
`)
await db.exec(readFileSync(new URL('schema.sql', dir), 'utf8'))
for (const f of readdirSync(dir).filter((f) => /^migrate-0(0[4-9]|1\d)\.sql$/.test(f)).sort()) {
  try { await db.exec(readFileSync(new URL(f, dir), 'utf8')) } catch (e) { throw new Error(`${f}: ${e.message}`) }
}

const one = async (sql, p = []) => (await db.query(sql, p)).rows[0]
const val = async (sql, p = []) => Object.values(await one(sql, p))[0]
const fails = async (sql, p, re) => {
  try { await db.query(sql, p) } catch (e) { assert.match(e.message, re); return }
  assert.fail(`expected failure: ${sql}`)
}
const j = JSON.stringify
const setting = (data) => db.query(`insert into app_settings (id, data) values (1, $1) on conflict (id) do update set data = excluded.data`, [j(data)])

await db.exec(`
  insert into plants (code, name) values ('KHJ', 'Al Kharj');
  insert into stores (plant_code, code, name, type) values ('KHJ', 'RM', 'RM Store', 'RM'), ('KHJ', 'L1', 'Line 1', 'WIP'), ('KHJ', 'FG', 'FG Store', 'FG');
  insert into materials (code, name) values ('COIL', 'PE coil');
  insert into customers (code, name) values ('C1', 'Cust');
  insert into orders (customer_id, customer_code, customer_name, status, dispatch_status) values (1, 'C1', 'Cust', 'APPROVED', 'PENDING'), (1, 'C1', 'Cust', 'APPROVED', 'PENDING');
  insert into order_items (order_id, item_no, brand, grade, color_code, core, skin, width, length, thickness, description, qty, m2, price, total)
  values (1, 1, 'ALUMAX', 'AL4025', 'AL4001', 'NFR', 0.21, 1250, 5600, 4, 'x', 10, 70, 50, 3500),
         (2, 1, 'ALUMAX', 'AL4025', 'AL4001', 'NFR', 0.21, 1250, 5600, 4, 'x', 30, 210, 50, 10500),
         (2, 2, 'ALUMAX', 'AL4025', 'AL4001', 'NFR', 0.21, 1250, 3050, 4, 'x', 5, 19.06, 50, 952);
`)

// Every order line got its FG item; same product + size = same item.
const items = (await db.query(`select fg_item_id f from order_items order by id`)).rows.map((r) => r.f)
assert.equal(items[0], items[1]); assert.notEqual(items[0], items[2])
assert.equal(await val(`select code from fg_items where id = $1`, [items[0]]), 'ALUMAX-AL4025-AL4001-NFR-0.21-1250*5600*4MM')
assert.equal(Number(await val(`select m2_per_pc from fg_items where id = $1`, [items[0]])), 7)
const A = items[0]

// Link off: a DO works exactly as before and leaves FG alone.
await db.query(`select generate_batch_do(1, $1, '{}', 'P')`, [j([{ id: 1, qty: 1, m2: 7 }])])
assert.equal(await val(`select count(*)::int from fg_moves`), 0)
await db.query(`select undo_dispatch((select max(id) from dispatches))`)

// FG opening stock (by attributes, as the CSV sends it), only once per store + item.
await db.query(`select post_fg_adjustment('OPENING', '2026-10-01', $1, 'A')`, [j([{ store: 3, brand: 'ALUMAX', grade: 'AL4025', color_code: 'AL4001', core: 'NFR', skin: 0.21, width: 1250, length: 5600, thickness: 4, qty: 12 }])])
assert.equal(Number(await val(`select sum(qty) from fg_moves where fg_item_id = $1`, [A])), 12)
await fails(`select post_fg_adjustment('OPENING', '2026-10-01', $1, 'A')`, [j([{ store: 3, item: A, qty: 1 }])], /already has FG stock/)
await fails(`select post_fg_adjustment('ADJUST', '2026-10-01', $1, 'A')`, [j([{ store: 1, item: A, qty: 1 }])], /only be in an FG store/)

// Link on: reservation (ready) counts; a DO can't take pieces reserved for another order.
await setting({ fg_link: true, fg_store: 'FG' })
await db.exec(`update order_items set ready_qty = 10 where id = 1`)  // Mark ready: order 1 reserves 10 of 12
await fails(`select generate_batch_do(2, $1, '{}', 'P')`, [j([{ id: 2, qty: 3, m2: 21 }])], /Not enough FG .* 1 pcs short/)
assert.equal(await val(`select count(*)::int from order_batches where order_id = 2`), 0)  // rolled back
await db.query(`select generate_batch_do(2, $1, '{}', 'P')`, [j([{ id: 2, qty: 2, m2: 14 }])])
await db.query(`select generate_batch_do(1, $1, '{}', 'P')`, [j([{ id: 1, qty: 10, m2: 70 }])])
assert.equal(Number(await val(`select sum(qty) from fg_moves where fg_item_id = $1`, [A])), 0)
assert.equal(Number(await val(`select ready_qty from order_items where id = 1`)), 0)
// Undo dispatch puts the pieces back (its FG entry goes with it).
await db.query(`select undo_dispatch((select max(id) from dispatches))`)
assert.equal(Number(await val(`select sum(qty) from fg_moves where fg_item_id = $1`, [A])), 10)
await db.query(`select generate_batch_do(1, $1, '{}', 'P')`, [j([{ id: 1, qty: 10, m2: 70 }])])

// Planning board numbers: order 2 still needs 28 of A and 5 of the 3050 size; nothing in stock.
const pos = async (id) => one(`select * from fg_position() where fg_item_id = $1`, [id])
assert.deepEqual(Object.values(await pos(A)).map(Number), [A, 0, 0, 28, 0, 0])

// Plan 20 of A on Line 1, produce 18 good + 2 rejected, using 50 kg of coil from the line.
assert.equal(await val(`select create_plan($1, $2)`, [j({ date: '2026-10-28', shift: 'DAY', line: 2, by: 'M' }), j([{ item: A, qty: 20 }])]), 'PLN-2026-001')
assert.equal(Number((await pos(A)).planned), 20)
await db.query(`select post_adjustment('OPENING', '2026-10-01', $1, 'A')`, [j([{ store: 1, material: 1, qty: 100 }])])
await db.query(`select create_transfer($1, $2)`, [j({ from: 1, to: 2, date: '2026-10-28', by: 'M' }), j([{ material: 1, qty: 60 }])])
await fails(`select create_production($1, $2, $3)`, [j({ date: '2026-10-28', shift: 'DAY', line: 2, by: 'O' }), j([{ item: A, plan_item: 1, good: 18 }]), j([{ material: 1, qty: 61 }])], /Not enough COIL in Line 1/)
assert.equal(await val(`select create_production($1, $2, $3)`, [j({ date: '2026-10-28', shift: 'DAY', line: 2, plan: 1, by: 'O' }), j([{ item: A, plan_item: 1, good: 18, rejected: 2, reason: 'dent' }]), j([{ material: 1, qty: 50 }])]), 'DPR-2026-001')
assert.equal(Number(await val(`select sum(qty) from stock_moves where store_id = 2`)), 10)  // 60 issued - 50 used
assert.deepEqual([Number((await pos(A)).planned), Number((await pos(A)).in_qc)], [2, 18])
assert.equal(await val(`select status from production_plans where id = 1`), 'OPEN')  // 18 of 20

// FG QC: 15 pass, 2 B-grade, 1 reject; auto-reserve gives the 15 to order 2 (setting on).
await setting({ fg_link: true, fg_store: 'FG', fg_auto_reserve: true })
const P = await val(`select id from production_items`)  // the refused entry above used up an id
await fails(`select qc_production($1, 'Q')`, [j([{ id: P, pass: 15, b: 2, reject: 0 }])], /must equal/)
await db.query(`select qc_production($1, 'Q')`, [j([{ id: P, pass: 15, b: 2, reject: 1, reason: 'scratch' }])])
assert.equal(Number(await val(`select sum(qty) from fg_moves where fg_item_id = $1`, [A])), 15)
assert.equal(Number(await val(`select sum(v.qty) from fg_moves v join fg_items f on f.id = v.fg_item_id where f.b_grade`)), 2)
assert.equal(await val(`select code from fg_items where b_grade`), 'ALUMAX-AL4025-AL4001-NFR-0.21-1250*5600*4MM-B')
assert.equal(Number(await val(`select ready_qty from order_items where id = 2`)), 15)
assert.deepEqual(Object.values(await pos(A)).map(Number), [A, 15, 15, 13, 2, 0])
await fails(`select qc_production($1, 'Q')`, [j([{ id: P, pass: 18, b: 0, reject: 0 }])], /must equal/)  // already done

// FG stock report.
const rows = (await db.query(`select code, opening, inward, outward, closing from fg_stock_summary('2026-10-01', '2026-10-31') order by code`)).rows
assert.deepEqual(rows.map((r) => [r.code.endsWith('-B') ? 'B' : 'A', +r.opening, +r.inward, +r.outward, +r.closing]), [['A', 0, 27, 12, 15], ['B', 0, 2, 0, 2]])
console.log('migrate-017: all checks passed')
