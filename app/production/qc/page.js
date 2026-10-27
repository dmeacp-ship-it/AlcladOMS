import Link from 'next/link'
import { db, requireRole } from '@/lib/server'
import { storeLabel } from '@/lib/inventory'
import { SHIFTS, prodMissing } from '@/lib/production'
import { day, qty } from '@/lib/tas'
import { qcProduction } from '../actions'
import ActionForm from '../../inventory/ActionForm'
import ProdTabs from '../ProdTabs'

export const metadata = { title: 'Check Finished Goods' }

// Produced pieces waiting for FG QC. Pass goes into the plant's FG store, B-grade into the same item + "-B",
// rejects are recorded (scrap weight comes with the granules phase). Rows left blank are not saved.
export default async function FgQc() {
  const [, missing, { data: rows }, { data: recent }] = await Promise.all([
    requireRole('manager'), prodMissing(),
    db().from('production_items').select('*, f:fg_items(code, color_name), p:productions!inner(id, dpr_no, prod_date, shift, line:stores(name, plant_code))')
      .is('qc_at', null).gt('good_qty', 0).order('production_id').order('id').limit(300),
    db().from('production_items').select('*, f:fg_items(code), p:productions!inner(id, dpr_no)').not('qc_at', 'is', null).order('qc_at', { ascending: false }).limit(20),
  ])

  return (
    <>
      <ProdTabs tab="qc" missing={missing} />
      {rows?.length ? (
        <ActionForm action={qcProduction} submit={{ label: 'Save check', icon: 'ph-seal-check', cls: 'btn btn-success btn-lg' }}>
          <div className="card">
            <div className="tbl-top">
              <h2 className="tbl-ttl"><i className="ph ph-seal-check" />Waiting to be checked <span className="badge b-warn">{rows.length}</span></h2>
              <span className="muted text-sm">Pass + B-grade + Reject must equal the good pieces. Rows left empty stay waiting.</span>
            </div>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>DPR</th><th>Item</th><th className="r">Good pcs</th><th>Pass</th><th>B-grade</th><th>Reject</th><th>Reason</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td className="nowrap" data-label="DPR">
                        <input type="hidden" name="row" value={r.id} />
                        <Link prefetch={false} className="qno" href={`/production/dpr/${r.p.id}`}>{r.p.dpr_no}</Link>
                        <span className="mat-sub">{day(r.p.prod_date)} · {SHIFTS[r.p.shift]} · {storeLabel(r.p.line)}</span>
                      </td>
                      <td data-label="Item"><span className="mat-name">{r.f.code}</span>{r.f.color_name && <span className="mat-sub">{r.f.color_name}</span>}</td>
                      <td className="num fw6" data-label="Good pcs">{qty(r.good_qty)}</td>
                      <td data-label="Pass"><input name={`pass_${r.id}`} type="number" inputMode="numeric" min={0} max={r.good_qty} step={1} placeholder={`of ${qty(r.good_qty)}`} aria-label={`Pass, ${r.f.code}`} style={{ width: 90 }} /></td>
                      <td data-label="B-grade"><input name={`b_${r.id}`} type="number" inputMode="numeric" min={0} max={r.good_qty} step={1} aria-label={`B-grade, ${r.f.code}`} style={{ width: 90 }} /></td>
                      <td data-label="Reject"><input name={`reject_${r.id}`} type="number" inputMode="numeric" min={0} max={r.good_qty} step={1} aria-label={`Reject, ${r.f.code}`} style={{ width: 90 }} /></td>
                      <td data-label="Reason"><input name={`reason_${r.id}`} placeholder="If B-grade or rejected" aria-label={`Reason, ${r.f.code}`} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </ActionForm>
      ) : (
        <div className="card"><div className="empty"><i className="ph ph-seal-check" /><h3>Nothing waiting to be checked</h3><p>Good pieces from production entries appear here.</p></div></div>
      )}

      {recent?.length > 0 && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="tbl-top"><h2 className="tbl-ttl"><i className="ph ph-clock-counter-clockwise" />Last checks</h2></div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>DPR</th><th>Item</th><th className="r">Pass</th><th className="r">B-grade</th><th className="r">Reject</th><th>Reason</th><th>By</th></tr></thead>
              <tbody>
                {recent.map((r) => (
                  <tr key={r.id}>
                    <td className="nowrap"><Link prefetch={false} className="qno" href={`/production/dpr/${r.p.id}`}>{r.p.dpr_no}</Link></td>
                    <td data-label="Item">{r.f.code}</td>
                    <td className="num" data-label="Pass">{qty(r.qc_pass)}</td>
                    <td className="num" data-label="B-grade">{qty(r.qc_b)}</td>
                    <td className="num" data-label="Reject">{qty(r.qc_reject)}</td>
                    <td data-label="Reason">{r.qc_reason || <span className="muted">—</span>}</td>
                    <td data-label="By">{r.qc_by}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )
}
