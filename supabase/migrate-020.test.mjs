// Test migrate-020 auto-issue on PGlite
import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import assert from 'node:assert/strict'

const dir = new URL('./', import.meta.url)
const db = new PGlite()

await db.exec(`
  create role anon; create role authenticated;
  create schema auth; create table auth.users (id uuid primary key, last_sign_in_at timestamptz, encrypted_password text);
  create table auth.sessions (user_id uuid);
  create schema storage; create table storage.buckets (id text primary key, name text, public boolean);
  create table storage.objects (metadata jsonb);
`)

await db.exec(readFileSync(new URL('schema.sql', dir), 'utf8'))
for (const f of readdirSync(dir).filter((f) => /^migrate-0(0[4-9]|1\d|20)\.sql$/.test(f)).sort()) {
  try {
    await db.exec(readFileSync(new URL(f, dir), 'utf8'))
  } catch (e) {
    throw new Error(`${f}: ${e.message}`)
  }
}

const one = async (sql, p = []) => (await db.query(sql, p)).rows[0]
const all = async (sql, p = []) => (await db.query(sql, p)).rows

// Setup plant, stores, materials
await db.exec(`
  insert into plants (code, name) values ('P1', 'Plant 1');
  insert into stores (plant_code, code, name, type) values
    ('P1', 'RM-1', 'Main RM Store', 'RM'),
    ('P1', 'L1', 'Line 1 WIP', 'WIP'),
    ('P1', 'FG-1', 'Main FG', 'FG');
  insert into materials (code, name, category, uom) values
    ('COIL-TOP', 'Top Coil', 'RM', 'KG'),
    ('COIL-BOT', 'Bottom Coil', 'RM', 'KG');
  -- Put opening stock into Main RM Store: 5000 KG of COIL-TOP
  insert into stock_moves (move_date, store_id, material_id, qty, ref_type, ref_no, by_name)
  values ('2026-10-31', (select id from stores where code = 'RM-1'), (select id from materials where code = 'COIL-TOP'), 5000, 'OPENING', 'INIT', 'Admin');
`)

const lineStore = await one(`select id from stores where code = 'L1'`)
const rmStore = await one(`select id from stores where code = 'RM-1'`)
const matTop = await one(`select id from materials where code = 'COIL-TOP'`)

// Initial stock on line is 0
const initLineStock = await one(`select coalesce(sum(qty), 0) as q from stock_moves where store_id = $1 and material_id = $2`, [lineStore.id, matTop.id])
assert.equal(Number(initLineStock.q), 0)

// Test DPR production with auto-issue: consume 350 KG of COIL-TOP on Line 1
const dprNo = await one(`
  select create_production(
    $1::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    $2::jsonb
  ) as no
`, [
  JSON.stringify({ date: '2026-10-31', shift: 'DAY', line: lineStore.id, by: 'Operator' }),
  JSON.stringify([
    { layer_type: 'TOP_COIL', material_id: matTop.id, actual_qty: 350, uom: 'KG' }
  ])
])

assert.ok(dprNo.no)
console.log('Production created:', dprNo.no)

// Verify auto-transfer was created!
const transfer = await one(`select * from transfers where to_store_id = $1`, [lineStore.id])
assert.ok(transfer, 'Transfer must be created')
assert.equal(transfer.from_store_id, rmStore.id)
assert.equal(transfer.requested_by, 'Auto-issue (DPR)')
console.log('Auto-issue transfer created:', transfer.doc_no)

const trItem = await one(`select * from transfer_items where transfer_id = $1`, [transfer.id])
assert.equal(Number(trItem.qty), 350)

// Verify stock moves:
// RM Store: 5000 (OPENING) - 350 (ISSUE) = 4650
const rmStock = await one(`select sum(qty) as q from stock_moves where store_id = $1 and material_id = $2`, [rmStore.id, matTop.id])
assert.equal(Number(rmStock.q), 4650)

// Line Store: +350 (ISSUE) - 350 (USE) = 0
const finalLineStock = await one(`select sum(qty) as q from stock_moves where store_id = $1 and material_id = $2`, [lineStore.id, matTop.id])
assert.equal(Number(finalLineStock.q), 0)

// Plan auto-issue: the app passes the parametric BOM totals; only the shortfall on the line moves.
const plan = await one(`insert into production_plans (plan_date, shift, line_store_id, by_name) values ('2026-10-31', 'DAY', $1, 'Planner') returning id, plan_no`, [lineStore.id])
const iss = await one(`select auto_issue_plan($1, $2::jsonb, 'Planner') as no`, [plan.id, JSON.stringify([{ material: matTop.id, qty: 120 }, { material: matTop.id, qty: 30 }])])
assert.match(iss.no, /ISS/)
const planTr = await one(`select * from transfers where doc_no = $1`, [iss.no])
assert.equal(Number(planTr.plan_id), Number(plan.id), 'transfer is linked to the plan')
assert.equal(Number((await one(`select sum(qty) q from stock_moves where store_id = $1 and material_id = $2`, [lineStore.id, matTop.id])).q), 150)
// Already enough on the line: nothing moves
assert.equal((await one(`select auto_issue_plan($1, $2::jsonb, 'Planner') as no`, [plan.id, JSON.stringify([{ material: matTop.id, qty: 100 }])])).no, 'ALREADY_STOCKED')
// More than the RM store holds: refused, nothing saved
const before = Number((await one(`select count(*) c from transfers`)).c)
await assert.rejects(db.query(`select auto_issue_plan($1, $2::jsonb, 'Planner')`, [plan.id, JSON.stringify([{ material: matTop.id, qty: 999999 }])]))
assert.equal(Number((await one(`select count(*) c from transfers`)).c), before, 'failed plan issue leaves no transfer')

// DPR whose consumption can't be covered by the RM store: the whole entry fails and the issue is undone
const dprsBefore = Number((await one(`select count(*) c from productions`)).c)
await assert.rejects(db.query(`select create_production($1::jsonb, '[]'::jsonb, '[]'::jsonb, $2::jsonb)`, [
  JSON.stringify({ date: '2026-10-31', shift: 'NIGHT', line: lineStore.id, by: 'Operator' }),
  JSON.stringify([{ layer_type: 'TOP_COIL', material_id: matTop.id, actual_qty: 999999, uom: 'KG' }]),
]))
assert.equal(Number((await one(`select count(*) c from productions`)).c), dprsBefore, 'no production saved')
assert.equal(Number((await one(`select count(*) c from transfers`)).c), before, 'no transfer saved')

console.log('migrate-020: all tests passed successfully!')
