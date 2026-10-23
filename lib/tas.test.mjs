// npm test   (quotation maths must match the old Google Sheet)
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { calcM2, lineTotal, totals, describe, dispatchStatus, dmy, balanceOf, readyOf } from './tas.js'

test('quote maths', () => {
  assert.equal(calcM2(1250, 5600, 10), 70)
  assert.equal(calcM2(0, 5600, 10), 0)
  assert.equal(lineTotal(70, 10, 60), 4200)
  assert.equal(lineTotal(0, 10, 60), 600) // no size -> priced per piece
  assert.deepEqual(totals([{ total: 4200 }], 100), { subtotal: 4200, transport: 100, vat: 645, total: 4945 })
  assert.equal(describe({ brand: 'ALUMAX', grade: 'AL4035', color_code: 'AL3008', width: 1250, length: 5600, thickness: 4 }), 'ALUMAX-AL4035-AL3008-1250*5600*4MM')
  assert.equal(dispatchStatus({ delivered_qty: 10, dispatched_qty: 0 }), 'PENDING')
  assert.equal(dispatchStatus({ delivered_qty: 10, dispatched_qty: 4 }), 'PARTIAL')
  assert.equal(dispatchStatus({ delivered_qty: 10, dispatched_qty: 10 }), 'DISPATCHED')
  assert.equal(dmy('2026-10-23'), '23.10.2026')
  assert.equal(balanceOf({ qty: 10, dispatched_qty: 4 }), 6)
  assert.equal(balanceOf({ qty: 10, dispatched_qty: 12 }), 0)
  assert.equal(readyOf({ ready_qty: 3, delivered_qty: 9 }), 3)
  assert.equal(readyOf({ ready_qty: null, delivered_qty: 9 }), 9) // older rows
})

test('csv round trip', async () => {
  const { toCSV, parseCSV } = await import('./csv.js')
  const rows = [{ a: 'Al-Taliah, "Summit"', b: 'line1\nline2' }, { a: 'مؤسسة', b: '' }]
  const csv = toCSV(rows, [['Name', (r) => r.a], ['Note', (r) => r.b]])
  assert.ok(csv.startsWith('\uFEFFName,Note\r\n'))
  assert.deepEqual(parseCSV(csv), [{ name: 'Al-Taliah, "Summit"', note: 'line1\nline2' }, { name: 'مؤسسة', note: '' }])
  assert.deepEqual(parseCSV('code,name\r\nC1,One\r\n\r\n'), [{ code: 'C1', name: 'One' }])
})
