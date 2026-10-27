import Link from 'next/link'
import { db, requireRole } from '@/lib/server'
import { invMasters } from '@/lib/inventory'
import { day, qty, today } from '@/lib/tas'
import { LinkBusy } from '../../../ui'
import { createGRN } from '../../actions'
import ActionForm from '../../ActionForm'
import InvTabs from '../../InvTabs'

export const metadata = { title: 'Receive Goods' }

// ?po=<id>: receive against that PO. Without it: pick one of the approved POs.
export default async function NewGRN({ searchParams }) {
  const poId = (await searchParams).po
  const [, { missing, stores }, { data: pos }] = await Promise.all([
    requireRole('manager'),
    invMasters(),
    db().from('purchase_orders').select('id, po_no, po_date, plant_code, vendor_name, items:po_items(*, m:materials(code, name, uom))')
      .eq('status', 'APPROVED').order('id', { ascending: false }).limit(200),
  ])
  const po = poId && pos?.find((p) => String(p.id) === String(poId))

  if (!po) {
    return (
      <>
        <InvTabs tab="grn" missing={missing} />
        {poId && <div className="banner warn"><i className="ph ph-warning" /><span>That PO isn't approved and open, so goods can't be received on it.</span></div>}
        <div className="card">
          <div className="tbl-top"><h2 className="tbl-ttl"><i className="ph ph-truck" />Pick the PO the goods came on</h2></div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>PO No</th><th>Date</th><th>Plant</th><th>Vendor</th><th className="r">Pending lines</th><th /></tr></thead>
              <tbody>
                {pos?.map((p) => (
                  <tr key={p.id}>
                    <td className="nowrap"><Link prefetch={false} className="qno" href={`/inventory/po/${p.id}`}>{p.po_no}</Link></td>
                    <td className="nowrap" data-label="Date">{day(p.po_date)}</td>
                    <td data-label="Plant">{p.plant_code}</td>
                    <td className="fw6" data-label="Vendor"><bdi>{p.vendor_name}</bdi></td>
                    <td className="num" data-label="Pending lines">{p.items.filter((i) => i.pending_qty > 0).length}</td>
                    <td className="r"><Link prefetch={false} className="btn btn-primary btn-sm" href={`/inventory/grn/new?po=${p.id}`}><LinkBusy />Receive</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!pos?.length && <div className="empty"><i className="ph ph-truck" /><h3>No approved POs</h3><p>A PO must be approved by an admin before goods can be received on it.</p></div>}
          </div>
        </div>
      </>
    )
  }

  po.items.sort((a, b) => a.line_no - b.line_no)
  const plantStores = stores.filter((s) => s.plant_code === po.plant_code)
  const rm = plantStores.filter((s) => s.type === 'RM')
  return (
    <>
      <InvTabs tab="grn" missing={missing} />
      <ActionForm action={createGRN} submit={{ label: 'Save GRN', icon: 'ph-check' }}>
        <input type="hidden" name="po" value={po.id} />
        <section className="fsec compact">
          <h2 className="fsec-ttl"><i className="ph ph-truck" />Receive on {po.po_no} · <bdi>{po.vendor_name}</bdi> · {po.plant_code}</h2>
          <div className="fgrid-2">
            <div className="fg">
              <label htmlFor="store">Into store <span className="req">*</span></label>
              <select id="store" name="store" required defaultValue={rm.length === 1 ? rm[0].id : ''}>
                <option value="" disabled>Select store…</option>
                {plantStores.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.type}</option>)}
              </select>
            </div>
            <div className="fg"><label htmlFor="date">Received on</label><input id="date" name="date" type="date" defaultValue={today()} max={today()} required /></div>
            <div className="fg"><label htmlFor="invoice_no">Vendor invoice / delivery note no.</label><input id="invoice_no" name="invoice_no" /></div>
            <div className="fg"><label htmlFor="notes">Notes</label><input id="notes" name="notes" placeholder="Vehicle no, condition on arrival…" /></div>
          </div>
          {!plantStores.length && <p className="red text-sm" style={{ marginTop: 10 }}>Plant {po.plant_code} has no store yet: add one under Settings → Stores.</p>}
        </section>
        <div className="card">
          <div className="tbl-top"><h2 className="tbl-ttl"><i className="ph ph-package" />Received quantity</h2><span className="muted text-sm">Up to 2% over the pending quantity is accepted. Leave a line blank if nothing came.</span></div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Material</th><th className="r">Ordered</th><th className="r">Pending</th><th>Received now</th></tr></thead>
              <tbody>
                {po.items.map((i) => (
                  <tr key={i.id}>
                    <td data-label="Material"><span className="mat-name">{i.m.name}</span><span className="mat-sub">{i.m.code}</span></td>
                    <td className="num" data-label="Ordered">{qty(i.qty)} {i.m.uom}</td>
                    <td className="num fw6" data-label="Pending">{qty(Math.max(0, i.pending_qty))}</td>
                    <td data-label="Received now">
                      <input type="hidden" name="po_item" value={i.id} />
                      <input name={`qty_${i.id}`} type="number" inputMode="decimal" step="any" min={0} max={Math.max(0, i.qty * 1.02 - i.received_qty)}
                        disabled={i.qty * 1.02 - i.received_qty <= 0} aria-label={`Received ${i.m.name}`} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </ActionForm>
    </>
  )
}
