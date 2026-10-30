// migrate-019 check on an in-memory Postgres (PGlite):
// Runs all migrations through 019, verifies core_settings, production_consumptions, and create_production.
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
for (const f of readdirSync(dir).filter((f) => /^migrate-0(0[4-9]|1\d)\.sql$/.test(f)).sort()) {
  try {
    await db.exec(readFileSync(new URL(f, dir), 'utf8'))
  } catch (e) {
    throw new Error(`${f}: ${e.message}`)
  }
}

const one = async (sql, p = []) => (await db.query(sql, p)).rows[0]
const val = async (sql, p = []) => Object.values(await one(sql, p))[0]

// 1. Check core_settings initialized
const nfr = await one(`select * from core_settings where core_type = 'NFR'`)
assert.equal(nfr.core_type, 'NFR')
assert.equal(Number(nfr.density), 0.92)

// 2. Set up test environment
await db.exec(`
  insert into plants (code, name) values ('KHJ', 'Al Kharj');
  insert into stores (plant_code, code, name, type) values
    ('KHJ', 'RM', 'RM Store', 'RM'),
    ('KHJ', 'L1', 'Line 1 Store', 'WIP'),
    ('KHJ', 'FG', 'FG Store', 'FG');
  insert into materials (code, name, kind, thickness, width, cost_price) values
    ('COIL-SILVER', 'Silver Top Coil 0.30', 'TOP_COIL', 0.30, 1270, 15.50),
    ('COIL-BOT-030', 'Bottom Coil 0.30', 'BOTTOM_COIL', 0.30, 1270, 12.00),
    ('LDPE-GRAN', 'LDPE Granules', 'CORE', null, null, 4.50);
  insert into customers (code, name) values ('C1', 'Customer 1');
  insert into orders (customer_id, customer_code, customer_name, status, dispatch_status) values
    (1, 'C1', 'Customer 1', 'APPROVED', 'PENDING');
  insert into order_items (order_id, item_no, brand, grade, color_code, core, skin, width, length, thickness, description, qty, m2, price, total)
  values (1, 1, 'ALUMAX', 'AL4025', 'AL4001', 'NFR', 0.30, 1250, 4000, 4, 'test item', 100, 500, 60, 30000);
`)

const fgItemId = await val(`select id from fg_items limit 1`)
const lineStoreId = await val(`select id from stores where code = 'L1'`)
const silverMatId = await val(`select id from materials where code = 'COIL-SILVER'`)
const botMatId = await val(`select id from materials where code = 'COIL-BOT-030'`)
const coreMatId = await val(`select id from materials where code = 'LDPE-GRAN'`)

// Put initial stock on the Line Store
await db.exec(`
  insert into stock_moves (move_date, store_id, material_id, qty, ref_type, ref_no, by_name) values
    ('2026-10-30', ${lineStoreId}, ${silverMatId}, 500, 'OPENING', 'INIT', 'Admin'),
    ('2026-10-30', ${lineStoreId}, ${botMatId}, 500, 'OPENING', 'INIT', 'Admin'),
    ('2026-10-30', ${lineStoreId}, ${coreMatId}, 2000, 'OPENING', 'INIT', 'Admin');
`)

// 3. Call create_production with detailed consumption
const pHead = { date: '2026-10-30', shift: 'DAY', line: lineStoreId, by: 'Supervisor Ali' }
const pItems = [{ item: fgItemId, good: 50, rejected: 2, reason: 'Edge dent' }]
const pConsumption = [
  {
    layer_type: 'TOP_COIL',
    material_id: silverMatId,
    suggested_mat_id: silverMatId,
    system_qty: 216.5,
    actual_qty: 220.0,
    uom: 'KG',
    reason: 'Trimming scrap',
    settings_snapshot: { skin: 0.3, density: 2.71 }
  },
  {
    layer_type: 'CORE',
    material_id: coreMatId,
    suggested_mat_id: coreMatId,
    system_qty: 850.0,
    actual_qty: 900.0,
    uom: 'KG',
    reason: 'Startup purge',
    settings_snapshot: { core_thick: 3.4, density: 0.92 }
  }
]

const dprNo = await val(`select create_production($1::jsonb, $2::jsonb, '[]'::jsonb, $3::jsonb)`, [
  JSON.stringify(pHead),
  JSON.stringify(pItems),
  JSON.stringify(pConsumption)
])

assert.match(dprNo, /^DPR-/)

// 4. Verify production_consumptions recorded
const rows = (await db.query(`select * from production_consumptions where production_id = (select id from productions where dpr_no = $1)`, [dprNo])).rows
assert.equal(rows.length, 2)
assert.equal(Number(rows[0].system_qty), 216.5)
assert.equal(Number(rows[0].actual_qty), 220.0)
assert.equal(Number(rows[0].diff_qty), 3.5)
assert.equal(Number(rows[0].diff_pct), 1.62)
assert.equal(rows[0].reason, 'Trimming scrap')

// 5. Verify stock deduction on the line store
const silverBal = await val(`select sum(qty) from stock_moves where store_id = $1 and material_id = $2`, [lineStoreId, silverMatId])
assert.equal(Number(silverBal), 280.0) // 500 - 220

// 6. Test Variance Report function
const reportRows = (await db.query(`select * from consumption_variance_report('2026-10-01', '2026-10-31')`)).rows
assert.equal(reportRows.length, 2)
assert.equal(reportRows[0].dpr_no, dprNo)
assert.equal(Number(reportRows[0].variance_value_sar), 54.25) // 3.5 kg diff * 15.50 cost

console.log('migrate-019: all tests passed successfully!')
