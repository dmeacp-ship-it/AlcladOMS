// Printable PO / GRN / issue slip on the letterhead, using the same A4 .doc styles as the sales documents.
// meta: [[label, value]]; party: [[heading, [lines]]]; rows: arrays of cells, first column left-aligned.
export default function Slip({ s, fno, title, meta, party = [], heads, rows, foot, notes, signs }) {
  const C = s.company
  return (
    <div className="doc">
      <img className="lh" src={`/letterhead?v=${s.letterhead_v || 0}`} alt="" />
      <div className="fno">{fno}</div>
      <div className="head">
        <div className="company">
          <div className="big">{C.NAME}</div>
          <div>{C.ADDRESS}</div>
          <div>CR NO:- {C.CR_NO}</div>
          <div>VAT: {C.VAT_NO}</div>
        </div>
        <dl className="meta">{meta.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v || '—'}</dd></div>)}</dl>
      </div>
      <h1 className="title">{title}</h1>
      {party.length > 0 && (
        <div className="party">
          {party.map(([h, lines]) => (
            <div key={h}><div className="label">{h}</div>{lines.filter(Boolean).map((l, i) => <div key={i}>{l}</div>)}</div>
          ))}
        </div>
      )}
      <table className="items">
        <thead><tr>{heads.map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}
          {Array.from({ length: Math.max(0, 8 - rows.length) }, (_, i) => <tr key={`b${i}`}>{heads.map((h) => <td key={h} />)}</tr>)}
        </tbody>
        {foot && <tfoot><tr>{foot.map((c, j) => (j === 0 ? <th key={j}>{c}</th> : <td key={j}>{c}</td>))}</tr></tfoot>}
      </table>
      {notes && <div className="terms">Notes: {notes}</div>}
      <div className="sign">
        {signs.map((x) => <div key={x} className="tall">{x}<br /><br />Name:<br /><br />Signature:</div>)}
      </div>
      <footer>{C.ADDRESS}<br />Helpline No: {C.HELPLINE} | Email: {C.EMAIL}</footer>
    </div>
  )
}
