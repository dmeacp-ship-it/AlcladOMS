// Shown inside the app frame while a page's data loads: the shape of a list page, not a spinner.
export default function Loading() {
  return (
    <div className="page-skel" role="status" aria-label="Loading…">
      <div className="page-skel-tiles">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton" />)}</div>
      <div className="card page-skel-card">
        <div className="skeleton" style={{ width: 180, height: 18 }} />
        {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="skeleton page-skel-row" />)}
      </div>
    </div>
  )
}
