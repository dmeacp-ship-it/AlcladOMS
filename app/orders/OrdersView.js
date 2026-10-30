'use client'
import { useState, useEffect, useOptimistic } from 'react'
import Link from 'next/link'
import { DISPATCH, STATUS, actionData, day, int, money, plural, totals } from '@/lib/tas'
import { ClickRow, DocsMenu, LinkBusy } from '../ui'
import OrderDialog from './OrderDialog'
import OrderActions from './OrderActions'
import { loadOrderDetail } from './actions'

// Client-rendered table view that enables instant (16 ms) order dialog opening from row data
// without full page server round-trips. History loads asynchronously in the background.
export default function OrdersView({
  rows,
  initialView,
  initialHistory,
  me,
  listHref,
  openBatchPi,
  sort,
  term,
  sortHrefs = {},
  SORTS,
}) {
  const [activeOrder, setActiveOrder] = useState(initialView || null)
  const [history, setHistory] = useState(initialHistory || null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [orders, setOrders] = useState(rows || [])

  const viewHref = (id) => `${listHref}${listHref.includes('?') ? '&' : '?'}view=${id}`
  const getSortHref = (next) => sortHrefs[next] || `${listHref}${listHref.includes('?') ? '&' : '?'}sort=${next}`

  useEffect(() => {
    setOrders(rows || [])
  }, [rows])

  const [optimisticRows, setOptimisticRows] = useOptimistic(
    orders,
    (state, update) => {
      if (update.type === 'APPROVE') {
        return state.map((o) => (o.id === update.id ? { ...o, status: 'APPROVED', dispatch_status: 'PENDING', _optimistic: true } : o))
      }
      if (update.type === 'REJECT') {
        return state.map((o) => (o.id === update.id ? { ...o, status: 'REJECTED', _optimistic: true } : o))
      }
      return state
    }
  )

  const handleAction = (id, type) => {
    setOptimisticRows({ id, type })
  }

  // Sync state if initialView changes from server navigation
  useEffect(() => {
    if (initialView) {
      setActiveOrder(initialView)
      setHistory(initialHistory || null)
    }
  }, [initialView, initialHistory])

  // Sync with browser Back / Forward buttons (popstate)
  useEffect(() => {
    const onPop = () => {
      const sp = new URLSearchParams(window.location.search)
      const v = sp.get('view')
      if (!v) {
        setActiveOrder(null)
        setHistory(null)
        return
      }
      const match = rows?.find((r) => String(r.id) === String(v))
      if (match) {
        openOrder(match, false)
      } else {
        loadOrderDetail(v).then((res) => {
          if (res?.order) {
            setActiveOrder(res.order)
            setHistory(res.history)
          }
        })
      }
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [rows])

  const openOrder = (order, push = true) => {
    setActiveOrder(order)
    setHistory(null)
    setHistoryLoading(true)
    if (push) {
      const url = viewHref(order.id)
      window.history.pushState(null, '', url)
    }
    loadOrderDetail(order.id)
      .then((res) => {
        if (res?.history) setHistory(res.history)
        if (res?.order) {
          setActiveOrder((prev) => (prev?.id === res.order.id ? { ...prev, ...res.order } : prev))
        }
        setHistoryLoading(false)
      })
      .catch(() => setHistoryLoading(false))
  }

  const closeOrder = () => {
    setActiveOrder(null)
    setHistory(null)
    window.history.pushState(null, '', listHref)
  }

  const SortTh = ({ label, up, down, cls }) => {
    const on = sort === up || sort === down
    const next = sort === down ? up : down
    return (
      <th className={cls} aria-sort={on ? (SORTS[sort][1] ? 'ascending' : 'descending') : 'none'}>
        <Link prefetch={false} href={getSortHref(next)} className="th-sort">
          <LinkBusy />{label}<i className={`ph ${on ? (SORTS[sort][1] ? 'ph-caret-up' : 'ph-caret-down') : 'ph-caret-up-down'}`} aria-hidden="true" />
        </Link>
      </th>
    )
  }

  return (
    <>
      <div className="tbl-wrap">
        <table className="tbl orders-tbl">
          <thead>
            <tr>
              <SortTh label="Quote No" up="oldest" down="newest" cls="c-q" />
              <SortTh label="Customer" up="customer" down="customer_desc" cls="c-cust" />
              <th className="c-st">Status</th>
              <th className="r c-tot">Total (SAR)</th>
              <th className="c-docs">Documents</th>
              <th className="c-date">Date</th>
              <th className="c-sp">Salesperson</th>
              <th className="r c-act">Actions</th>
            </tr>
          </thead>
          <tbody>
            {optimisticRows?.map((o) => {
              const pcs = (o.items || []).reduce((n, it) => n + Number(it.qty || 0), 0)
              const bs = o.batches || []
              const d = actionData(o)
              return (
                <ClickRow key={o.id} href={viewHref(o.id)} onOpen={() => openOrder(o)}>
                  <td className="nowrap c-q">
                    <Link prefetch={false} href={viewHref(o.id)} scroll={false} className="qno">
                      {o.quote_no}
                    </Link>
                  </td>
                  <td className="c-cust"><bdi className="cust-name">{o.customer_name}</bdi></td>
                  <td className="nowrap c-st">
                    {o.status === 'APPROVED' && DISPATCH[o.dispatch_status]
                      ? <span className={`badge ${DISPATCH[o.dispatch_status][1]}`}>{DISPATCH[o.dispatch_status][0]}</span>
                      : <span className={`badge b-${o.status}`}>{STATUS[o.status] || o.status}</span>}
                  </td>
                  <td className="num c-tot"><span className="fw6">{money(totals(o.items, o.transport, o.vat_rate).total)}</span><span className="cell-sub">{int(pcs)} PCS</span></td>
                  <td className="c-docs">
                    <DocsMenu o={d} />
                    <span className="cell-sub doc-ref">{bs.length === 1 ? bs[0].do_no : bs.length ? plural(bs.length, 'DO') : o.doc_no || 'Quote only'}</span>
                  </td>
                  <td className="nowrap muted c-date">{day(o.quote_date)}</td>
                  <td className="c-sp">{o.salesperson_name}</td>
                  <td className="nowrap c-act"><div className="row-acts icons"><OrderActions o={d} me={{ role: me.role }} back={listHref} sm onAction={handleAction} /></div></td>
                </ClickRow>
              )
            })}
          </tbody>
          </table>
          {!optimisticRows?.length && (
          <div className="empty">
            <i className="ph ph-clipboard-text" />
            <h3>No orders found</h3>
            <p>{term ? `Nothing matches “${term}”.` : 'Nothing in this list yet.'}</p>
          </div>
        )}
      </div>

      {activeOrder && (
        <OrderDialog
          o={activeOrder}
          history={history}
          me={me}
          back={viewHref(activeOrder.id)}
          closeHref={listHref}
          openBatchPi={openBatchPi}
          onClose={closeOrder}
          historyLoading={historyLoading}
        />
      )}
    </>
  )
}
