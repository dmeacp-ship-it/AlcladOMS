# Speed plan: matching DOT ONE (virgo.techdotbit.in)

Written 2026-10-29. Nothing below is implemented yet.

## Why DOT ONE feels faster

Both apps' servers answer in about 100 ms, so raw server speed is not the difference.
DOT ONE puts something new on screen the moment you click. TAS OMS waits for the server
to finish before the screen changes at all.

| | DOT ONE | TAS OMS today |
|---|---|---|
| Page HTML | Built once ahead of time and served from cache (`x-nextjs-prerender: 1`) | Built fresh on every request (`no-store`) after the Supabase queries finish |
| Data | Fetched by the browser after the page is already showing (~43 ms per API call via Cloudflare Delhi) | Fetched on the server before anything is sent |
| Links | Next.js prefetching on | 99 of 124 links set `prefetch={false}` (see comment at `app/Shell.js:183`) |
| Opening a record | Shows right away | `/orders?view=ID` rebuilds the whole orders page on the server |
| Repeat visits | Service worker keeps `/_next/static` files on the device | No service worker |

The goal is not to rebuild TAS OMS the way DOT ONE is built (static pages plus browser fetching). That
would mean rewriting the app. The goal is the same feel: **every click changes the screen in under
100 ms, and the data shows up in under ~400 ms.**

---

## Step 0: Measure first (½ hour)

Time these 5 actions on the live site (bom1), with warm connections, using a signed-in test user:

1. Sidebar: All Orders → Active Orders
2. Orders list: click a quote number (dialog opens)
3. Close the dialog
4. Switch a tab (My Work / All Active / Everything)
5. Click an action button (for example Approve) until the list updates

For each one, record: **time until the screen first changes** and **time until the data is in place**.
Use this table to check every step below.

---

## Step 1: The order dialog opens instantly (biggest win)

**Now:** clicking a quote number goes to `/orders?view=ID`. The server runs `requireRole`,
`batchQueues`, `fetchOrder`, `orderHistory`, `myWorkIds`, the list query, `findOrder` and `orderCounts`,
then sends back the whole page. `generateMetadata` also calls `findOrder` a second time.

**Change:**
- Make the quote number in each list row a client-side click handler. The row already holds the
  order's items and batches, so open `OrderDialog` from that data **right away**.
- Update the URL with `window.history.pushState(null, '', '?view=ID')`. In Next 16 this keeps
  `useSearchParams` in step **without** a server render, so the back button and shared links still work.
- Load the rest (history, full `findOrder` fields) with a small server action called from the
  dialog, and show a skeleton only in those parts of the dialog.
- Closing the dialog is `history.back()` / `pushState` back to the list URL, which is also instant.
- A shared link that opens `/orders?view=ID` directly keeps the current server path.

**Expected:** dialog opens in ~16 ms (one frame) instead of a full page round trip.

**Files:** `app/orders/page.js`, `app/orders/OrderDialog.js`, new `app/orders/actions.js` function `loadOrderDetail(id)`.

---

## Step 2: Start loading before the click (prefetch on intent)

**Now:** prefetch was turned off on purpose, because these pages depend on the signed-in user and
viewport prefetching would render every visible link on the server for nothing.

**Change:** don't turn viewport prefetching back on. Prefetch only on **intent**:
- Add a small `IntentLink` (or change the existing `Link` wrapper) that calls
  `router.prefetch(href)` on `pointerenter` and `touchstart`.
- Use it only for the sidebar items, `PageTabs`, and the Orders tabs/filter.
  Leave `prefetch={false}` on rows, sort headers and pagination.
- `staleTimes.dynamic: 30` in `next.config.mjs` already keeps the prefetched page for 30 s.

**Expected:** a hover gives a 150–300 ms head start, and on phones `touchstart` gives ~100 ms, so most
tab and sidebar switches feel instant.

---

## Step 3: Fewer waits on the server

**Orders page (`app/orders/page.js`)** runs 3 rounds of queries one after another:
1. `Promise.all([requireRole, batchQueues, fetchOrder, orderHistory])`
2. `await myWorkIds(me.role)`, which waits on `me`
3. `Promise.all([findOrder, list query, orderCounts])`

**Change:**
- Start `myWorkIds` as soon as `requireRole` resolves, chained with `.then` inside the first
  `Promise.all`, and start `orderCounts` there too. That takes it from 3 rounds to 2.
- Better: put the list query, counts and my-work IDs into **one Supabase RPC** (SQL function, pasted into
  the SQL Editor as `migrate-0xx.sql`) so the page needs a single trip.
- Wrap `findOrder` in React `cache()` so `generateMetadata` and the page share one call, or drop the
  quote number from the tab title.
- Do the same review for `app/layout.js:43-50` (`currentUser`, `orderCounts`, `getUsage`, `invTodo`, then
  `openLineCount` / `myWorkIds` run after it). The layout runs on full loads and on every `revalidatePath('/', 'layout')`.

**Expected:** ~100–200 ms less server time per orders page.

---

## Step 4: Buttons respond instantly (optimistic updates)

**Now:** after Approve / Ship / Mark ready, the row doesn't change until the server action finishes,
`revalidatePath` runs, and the page renders again.

**Change:** in `OrderActions.js` (and the plant/production actions), use React `useOptimistic` to move
the row to its new status / remove it from the queue at once, then let the real refresh correct it.
On an error, the optimistic state rolls back and a toast shows.

**Expected:** actions feel instant, even though the server still takes the same time.

---

## Step 5: Service worker for static files (repeat visits)

Copy DOT ONE's approach. It is about 40 lines and caches **only build assets, never data**:
- `public/sw.js`: cache-first for `/_next/static/*`, `/icons/*` and the fonts; network-only for pages
  and server actions; serve an `offline.html` when a navigation fails.
- Register it once in `app/Shell.js` (`navigator.serviceWorker.register('/sw.js')`).
- Add `sw.js` to the matcher exclusions in `proxy.js` so it isn't run through the session check.

**Expected:** a second visit or reopening the PWA downloads ~0 KB of JS/CSS, so the app boots faster on
slow mobile data in KSA.

---

## Step 6: Keep (don't undo)

- Region `bom1` + Supabase Mumbai: this is already right for India + KSA users.
- `getClaims()` in `proxy.js` (local JWT check): already the fast path.
- No root `app/loading.js`. It was removed because it held streamed pages back. If a skeleton is
  wanted, put a `<Suspense>` around the **slow part only** inside the page, not a route-level loading file.

## Not recommended

- Rewriting pages as static shells that fetch everything in the browser (DOT ONE's design). Steps 1–4 get
  most of the same feel for a fraction of the work, and keep server-side role checks where they are.
- Adding SWR / React Query. Server actions plus `useOptimistic` cover what's needed.

---

## Order of work and size

| # | Step | Effort | Effect on feel |
|---|---|---|---|
| 1 | Instant order dialog | ~½ day | Very high |
| 2 | Prefetch on hover/touch | ~1 hour | High |
| 3 | Fewer server waits (+ optional RPC) | ~2–4 hours | Medium |
| 4 | Optimistic action buttons | ~½ day | High |
| 5 | Static-asset service worker | ~1 hour | Medium (repeat visits / mobile) |

After each step: run the Step 0 timings again, record them in `productlog.md`, and deploy on its own,
so any slowdown can be traced to one change.
