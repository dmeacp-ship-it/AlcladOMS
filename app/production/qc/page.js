import Link from 'next/link'
import { db, requireRole } from '@/lib/server'
import { storeLabel } from '@/lib/inventory'
import { SHIFTS, prodMissing } from '@/lib/production'
import { day, qty } from '@/lib/tas'
import { ClickRow } from '../../ui'
import { qcProduction } from '../actions'
import ProdTabs from '../ProdTabs'
import QcForm from './QcForm'

export const metadata = { title: 'Check Finished Goods' }

// Produced pieces waiting for FG QC. Pass goes into the plant's FG store, B-grade into the same item + "-B",
// rejects are recorded (scrap weight comes with the granules phase). Rows left blank are not saved.
export default async function FgQc() {
  const [, missing, { data: rawRows }, { data: recent }] = await Promise.all([
    requireRole('manager'),
    prodMissing(),
    db().from('production_items').select('*, f:fg_items(code, color_name), p:productions!inner(id, dpr_no, prod_date, shift, line:stores(name, plant_code))')
      .is('qc_at', null).gt('good_qty', 0).order('production_id').order('id').limit(300),
    db().from('production_items').select('*, f:fg_items(code), p:productions!inner(id, dpr_no)').not('qc_at', 'is', null).order('qc_at', { ascending: false }).limit(20),
  ])

  const rows = (rawRows || []).map((r) => ({
    ...r,
    lineLabel: storeLabel(r.p?.line),
  }))

  return (
    <>
      <ProdTabs tab="qc" missing={missing} />

      {rows?.length ? (
        <QcForm
          action={qcProduction}
          rows={rows}
          shifts={SHIFTS}
        />
      ) : (
        <div className="card">
          <div className="empty">
            <i className="ph ph-seal-check" />
            <h3>Nothing waiting to be checked</h3>
            <p>Good pieces from production entries appear here.</p>
          </div>
        </div>
      )}

      {recent?.length > 0 && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="tbl-top">
            <h2 className="tbl-ttl">
              <i className="ph ph-clock-counter-clockwise" />
              Last checks <span className="badge b-none">{recent.length}</span>
            </h2>
            <span className="muted text-sm">Click any row to open the production entry (DPR).</span>
          </div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>DPR</th>
                  <th>Item</th>
                  <th className="r">Pass</th>
                  <th className="r">B-grade</th>
                  <th className="r">Reject</th>
                  <th>Reason</th>
                  <th>Checked By</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r) => (
                  <ClickRow key={r.id} href={`/production/dpr?view=${r.p.id}`}>
                    <td className="nowrap">
                      <Link prefetch={false} className="qno" href={`/production/dpr?view=${r.p.id}`}>
                        {r.p.dpr_no}
                      </Link>
                    </td>
                    <td data-label="Item">{r.f.code}</td>
                    <td className="num fw6" data-label="Pass">{qty(r.qc_pass)}</td>
                    <td className="num" data-label="B-grade">
                      {r.qc_b ? qty(r.qc_b) : <span className="muted">0</span>}
                    </td>
                    <td className={`num${r.qc_reject ? ' red fw6' : ''}`} data-label="Reject">
                      {r.qc_reject ? qty(r.qc_reject) : <span className="muted">0</span>}
                    </td>
                    <td data-label="Reason">{r.qc_reason || <span className="muted">—</span>}</td>
                    <td data-label="Checked By">{r.qc_by}</td>
                  </ClickRow>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )
}
