# TAS OMS — Product Log

Running record of what the TAS Order Management web app is, every decision made, every change shipped,
and what is still open. Newest status first, then decisions, then the full change history.

- **Product:** TAS OMS — quotation → approval → Delivery Order → plant dispatch, with Proforma Invoice → tax invoice, for
  TAS International Manufacturing Company (ALCLAD / ALUMAX), Al Kharj, KSA.
- **Replaces:** the "FMS- OMS SAUDI" Google Sheet + Apps Script (`../1_Code_Setup.txt`,
  `../2_Code_Quotation.txt`, `../3_PI_DN_Invoice.txt`, `../4_PDF_Export.txt`).
- **Location:** `C:\Users\Admin\Desktop\APPS\Saudi Projects\tas-oms`
- **Stack:** Next.js 16.4 (App Router, plain JavaScript, Server Actions) · React 19 · Supabase
  (Postgres + Auth + Storage) · Phosphor icons · no CSS framework.
- **Hosting target:** Vercel (not deployed yet). Runs locally with `npm --prefix tas-oms run dev`.

---

## 1. Current status (2026-10-23)

| Area | State |
|---|---|
| Build (`next build`) | ✅ passes |
| Tests (`npm test`, quotation maths) | ✅ 1/1 passing |
| Supabase project | `viamcradzcvimekymbcu` — keys in `.env.local` (git-ignored) |
| Database schema + seed | ✅ run (118 customers, 3,800 items, `tax-invoices` bucket) |
| `migrate-001.sql` | ✅ run |
| `migrate-002.sql` (DO before PI) | ⚠️ **NOT run yet** — until it is, *Generate DO* fails with "the order has no Proforma Invoice yet" |
| `migrate-003.sql` (plant dispatch, timeline) | ⚠️ **NOT run yet** — until it is, the orders list and the Plant page fail (missing `dispatch_status` / `balance_qty`) |
| Users | 1 admin (`dme.acp@virgoasia.com`) |
| Orders | 1 — `Q-2026-001`, APPROVED, no DO / PI yet |
| Real end-to-end test (DO, PI, upload against live data) | ❌ not done yet — needs `migrate-002.sql` first |

### To do next (in order)
1. Run `supabase/migrate-002.sql`, then `supabase/migrate-003.sql`, in Supabase → SQL Editor.
2. Create a **plant** user under Users.
3. Walk `Q-2026-001` through Generate DO → Plant Dispatch (part, then the rest) → Generate PI → Upload Invoice,
   try Undo and Short Close on a test order, and check the printed documents and the Timeline.
4. Supabase → Authentication → turn **off** "Allow new users to sign up" (only the admin creates users).
5. Create the real users (sales / approver / operations / accounts / plant) under **Users**.
6. Fix customer codes / CR / mobile under **Customers** if the live sheet differs (seed generated `CUS-001…`).
7. Deploy to Vercel (GitHub repo → import → add the 3 env vars).
8. If this chat may be shared: rotate the Supabase service-role key and update `.env.local`.

---

## 2. Workflow and roles (current)

**Flow:** Quotation → Approval → **Delivery Order (DO)** → **plant dispatch** (line by line, part quantities allowed),
with **Proforma Invoice (PI)** → Tax invoice upload alongside the dispatch.

| Step | Who | Where | Rules |
|---|---|---|---|
| Create quotation | sales, admin | New Quotation | Customer + salesperson required; every line attribute must exist in the Item Master; qty > 0; transport ≥ 0; VAT 15% on (subtotal + transport); confirm dialog before submit |
| Approve / Reject | approver, admin | Active Orders → row Actions, or order dialog | Reject needs a reason; only while PENDING |
| Cancel order | approver, admin | order dialog footer | Reason required; only PENDING/APPROVED and only before a DO → status CANCELLED |
| Generate DO | operations, admin | Active Orders → row Actions | APPROVED, no DO yet; DO qty ≤ ordered; ≥ 1 line > 0; sets dispatch status Pending |
| Plant status per DO line | plant, admin | Plant Dispatch or order dialog (pill, saves on change) | Pending / Under Production / Coil N/A (+ coil expected date); only while the DO is being dispatched |
| Dispatch | plant, admin | Plant Dispatch (per line or per DO), Active Orders row, order dialog | Qty ≤ line balance; date between DO date and today; optional vehicle, transporter, LR no, driver; one `dispatches` row per line; order → Partially / Fully Dispatched |
| Undo dispatch | plant, admin | order dialog → Dispatch History | Puts the qty back into the balance; status recalculated |
| Short close | plant, approver, admin | order dialog footer | Reason required; only while Pending / Partially Dispatched; balance will not ship; PI / tax invoice carry on |
| Generate PI | accounts, admin | Active Orders → row Actions | Only after the DO; qty ≤ ordered (defaults to delivered); a changed unit price needs a reason (`price_note`) |
| Upload tax invoice | accounts, admin | Active Orders → row Actions | After the PI; PDF or image, max 4 MB; replacing deletes the old file |
| Duplicate quotation | sales, admin | order dialog | Opens New Quotation pre-filled (`/orders/new?from=ID`), e.g. to resubmit a rejected quote |
| Customers, Items, Users | admin | sidebar → Admin | Add / edit / delete in dialogs |

- **Roles:** `admin` (everything), `sales` (creates quotes, sees **only their own** orders),
  `approver`, `operations`, `accounts`, `plant` (plant status + dispatch).
- **One DO and one PI per order.**
- **Numbers:** quotes `Q-YYYY-NNN` (restart yearly); DO and PI **share one number**
  `CUSTCODE-DD/MM/YY-NN` (per customer per day) — whichever is generated first assigns it (now always the DO).
- **Timezone:** Asia/Riyadh for all dates.
- **Status values:** PENDING, APPROVED, REJECTED, CANCELLED.
- **Dispatch status** (stored in `orders.dispatch_status`, kept in step by `refresh_dispatch_status()`):
  PENDING / PARTIAL / DISPATCHED / SHORT_CLOSED, shown as Pending Dispatch / Partially Dispatched / Fully Dispatched /
  Short Closed next to the order status. Per line: `delivered_qty` = DO qty, `dispatched_qty`, `balance_qty` (generated).

### Screens
- **Login** — email + password (show/hide), FMS login card.
- **All Orders** (`/orders`) — stat tiles that filter (All, Active, Pending, Awaiting DO, Awaiting PI,
  Awaiting Tax Inv, Approved, Rejected), search, 100 per page, clickable rows, Actions column, document chips.
- **New Quotation** (`/orders/new`) — sheet-style line grid with pick-lists, live M2 / totals / VAT, add lines.
- **Active Orders** (`/orders?status=ACTIVE`) — every order still moving; sidebar badge = orders waiting on
  *your* role (approver: pending; accounts: awaiting PI + awaiting tax invoice; operations: awaiting DO; admin: all).
- **Order Profile dialog** (`/orders?view=ID`) — opens over the list: header with status steps; body with
  next-step note, Customer Details, Order Details, Items & Production, Documents; footer with Cancel Order /
  Duplicate on the left and the role's next actions + Close on the right. Old `/orders/ID` links redirect here.
- **Plant Dispatch** (`/plant`, plant + admin) — DO lines grouped by DO (oldest first), tiles Open / Pending /
  Partial / Dispatched, search, plant status pill per line, Dispatch per line or "Dispatch lines" per DO.
- **Order dialog additions** — Dispatch step in the tracker, Plant Status / DO Qty / Dispatched / Balance per line,
  Dispatch History (with Undo), Short Close, Timeline.
- **Print pages** (`/orders/ID/print/quote|do|pi`) — A4 documents in the TAS format; Print → Save as PDF.
- **Admin:** Customers, Items (search + 50 per page), Users.

---

## 3. Decisions (who decided what, and why)

| Date | Decision | Decided by |
|---|---|---|
| 2026-10-23 | Rebuild the Apps Script system as a login-based web app: Node.js (Next.js) + Supabase | User |
| 2026-10-23 | Approval moves from the emailed one-click link to an in-app **role** (approver) | User |
| 2026-10-23 | 5 roles: admin, sales, approver, operations, accounts | User (picked from options) |
| 2026-10-23 | Frontend: **Next.js** | User |
| 2026-10-23 | Documents as **printable pages** (browser Save as PDF), not stored PDF files | User |
| 2026-10-23 | Keep **one DO and one PI per order** (same as the sheet) | User |
| 2026-10-23 | Seed masters from `Ref files` xlsx (Supplier List → customers, RM-Finish Goods SKU → items) | User |
| 2026-10-23 | **Start fresh** — no import of old sheet orders | User |
| 2026-10-23 | User's own Supabase project; host on **Vercel** | User |
| 2026-10-23 | Defaults taken (not asked): Supabase Auth email+password, admin creates users (no self sign-up, no verification email), salespersons are Sales-role users, in-app pending list instead of email, English UI, Riyadh timezone | Claude (announced) |
| 2026-10-23 | All DB access server-side with the service-role key; RLS on with **no policies** | Claude |
| 2026-10-23 | Workflow additions: cancel order, duplicate quote, price-change reason, Awaiting PI/DN/Tax queues, PI before DN | "App workflow audit" session |
| 2026-10-23 | UI must follow `GAS FMS\Stylesheet.html` exactly, with **red instead of indigo** as primary | User |
| 2026-10-23 | Orders open as an FMS-style **dialog** over the list; actions in dialogs | User |
| 2026-10-23 | Rename "Orders" → **All Orders**; "Pending Approval" → **Active Orders** with per-row action buttons (Approve/Reject, Generate DO, Generate PI, Upload Invoice) on one page | User |
| 2026-10-23 | On-screen wording **DO / Delivery Order** (printed document keeps the TAS title "DELIVERY NOTE") | User asked for "Generate DO"; printed title kept by Claude |
| 2026-10-23 | Printed document title renamed to **DELIVERY ORDER** (number label "DELIVERY ORDER NO.") | User |
| 2026-10-23 | **Flow corrected: DO before PI** (Quotation → Approval → DO → PI → Upload Invoice) | User |
| 2026-10-23 | Plant role + plant workflow (from GAS FMS) | User approved |
| 2026-10-23 | **Plant comes after the DO**: the plant dispatches each DO line, part quantities allowed, until fully dispatched; order shows Pending / Partially / Fully Dispatched in All Orders, Active Orders and the dialog; fully dispatched orders stay in Active Orders until PI + tax invoice | User |
| 2026-10-23 | DO still made by operations; truck details (vehicle, transporter, LR no, driver) per dispatch; Undo + Short Close; plant line status (Pending / Under Production / Coil N/A) and order Timeline kept; customer delivery confirmation dropped for now; the "Ready for Production" gate on the DO removed | User accepted Claude's suggestions |

---

## 4. Change history

### 2026-10-23 — 1. Discovery and questions
- Read the Apps Script sources: Settings, master sheets, in-sheet Quotation Form, single `Orders` sheet
  (48 columns), onEdit dropdown "buttons", email approval via `doGet`, DO / PI quantity dialogs,
  customer-day document numbers, tax invoice upload to Drive, printable Quotation / Delivery Note / PI sheets.
- Asked two rounds of questions (roles, frontend, PDFs, partial DOs; masters, old orders, Supabase, hosting).

### 2026-10-23 — 2. First build
- `supabase/schema.sql`: `profiles`, `customers`, `items`, `orders` (customer snapshot, status, approval,
  shared `doc_no`, `do_date`, `pi_date`, `tax_invoice_path`), `order_items` (line + production + delivered + invoiced);
  `next_quote_no()` (advisory lock), `assign_doc_no()`, `item_options()`; RLS on, no policies; private `tax-invoices` bucket.
- `supabase/make_seed.py` → `supabase/seed.sql` (118 customers `CUS-001…`, 3,800 SKUs).
- Letterhead image extracted from the Apps Script base64 to `public/letterhead.png`.
- Next.js app: login, orders list, quotation form (live M2/totals, Item Master validation), order page,
  approve/reject, production status, DO and PI with per-line quantities, tax invoice upload (signed-URL viewing),
  admin users / customers / items, printable Quotation / Delivery Note / PI (TAS format, fits one A4 page).
- `proxy.js` refreshes the Supabase session and sends signed-out users to `/login`.
- `lib/tas.test.mjs`: M2, line total, totals/VAT, description format, dispatch status, date format.
- Verified build + layouts of the three documents with sample data.

### 2026-10-23 — 3. Connecting Supabase
- `.env.local` written with the project's URL, anon key and service-role key.
- Confirmed schema + seed were run (118 / 3,800 rows, bucket present).
- Gave the user a SQL snippet to create the first admin; admin profile now exists.

### 2026-10-23 — 4. "App workflow audit" session (separate session, same files)
- `supabase/migrate-001.sql`: status CANCELLED; `do_by`, `pi_by`, `price_note` columns; `assign_doc_no` refuses
  orders without a customer code; `generate_do` / `generate_pi` RPCs (header + lines + number in one transaction).
- Cancel order (reason, before DN), duplicate quotation (`?from=`), price-change reason on PI,
  qty ≤ ordered checks, DN only for Ready lines, work queues (Awaiting PI / DN / Tax), orders paging (100),
  replaced tax invoice file deleted from storage, PI made to come before DN *(later reversed — see 8)*.

### 2026-10-23 — 5. First restyle, then the full FMS design
- First pass at the FMS look (red primary, light/dark). User reported it as messy.
- **Root causes found:** the page-header class `.ph` clashed with the icon font's `.ph` class (icons shifted
  16px, tall menu items, serif order number); the document's `.co` class clashed with FMS's orange `.co` utility;
  `.empty i` enlarged icons inside buttons; mixed Arabic/English names reordered separators.
- Rebuilt on the FMS design system (`app/globals.css`): tokens for light/dark, collapsible sidebar (logo click,
  remembered), topbar with title/subtitle + search pill + theme switch (circular reveal) + refresh, cards,
  stat tiles, grouped tables, iOS-style filled inputs, pill buttons, status pills, badges, banners,
  island toasts with close, empty states, skeletons, file drop zone, login card.
- Dialog system on native `<dialog>` (`app/ui.js`): Approve, Reject, Cancel, Generate PI / DO, Upload,
  Add/Edit/Delete customer, item, user, submit-quotation confirm; spinner while working, closes when done.
- Production status became an auto-saving pill; whole rows clickable; admin saves keep page/search;
  styled 404; customer names wrapped in `<bdi>`.
- Checked every page and dialog in the browser (light + dark) using a temporary dev-only preview pass,
  removed afterwards.

### 2026-10-23 — 6. Order Profile dialog
- Orders open as a large dialog over the list (`/orders?view=ID`, `app/orders/OrderDialog.js`), like FMS
  `viewOrderDetails`: status steps in the header, profile sections in the body, actions in the footer.
- Nested dialogs stack on top; Esc closes only the top one; closing returns to the same filtered list.
- Removed the full-page skeleton (it flashed over the list); added a thin red loading bar instead.

### 2026-10-23 — 7. Active Orders + row actions
- Sidebar: **All Orders**, **New Quotation**, **Active Orders** (badge = work waiting on your role);
  Awaiting PI / DN menu items removed (tiles still filter).
- `app/orders/OrderActions.js`: one set of action buttons used both in list rows and the dialog footer.
- Actions column on every orders list; buttons open dialogs over the list and return to it.
- On-screen wording changed to DO / Delivery Order.

### 2026-10-23 — 8. Flow corrected: DO before PI
- `supabase/migrate-002.sql` (+ `schema.sql`): `generate_do` no longer needs a PI; `generate_pi` requires a DO.
- App: queues (Awaiting DO = approved without DO; Awaiting PI = DO done, no PI), server checks, row buttons,
  status steps, next-step notes, column/document order, PI quantities default to delivered.
- **Pending:** the user has to run `migrate-002.sql`.

### 2026-10-23 — 9. Plant dispatch (App workflow audit session)
- `supabase/migrate-003.sql` (+ `schema.sql`): `plant` role; line plant status Pending / Under Production / Coil N/A
  (+ `coil_date`) replaces Not Ready / Ready; `dispatched_qty` and generated `balance_qty` per line;
  `orders.dispatch_status` + `short_close_reason`; `dispatches` and `order_events` tables (RLS on, no policies; timeline
  back-filled from existing orders); `generate_do` sets PENDING; `record_dispatch` (locks the order, checks every
  balance, one transaction), `undo_dispatch`, `refresh_dispatch_status`.
- App: Plant Dispatch page (`/plant`) + menu item with badge; `DispatchModal`; Dispatch button in row Actions and the
  dialog for plant users; dispatch badge next to the status in every orders list; Awaiting Dispatch tile/queue; Active
  Orders also keeps orders not fully dispatched; dialog tracker step, per-line dispatch columns, Dispatch History +
  Undo, Short Close, Timeline; `PlantStatus` pill (replaces `StatusSelect`); every action writes a timeline event.
- Checked: `next build`, `npm test`, both SQL files parse (pglast). **Not yet run against the live database.**

---

## 5. Architecture

### Files
| Path | What |
|---|---|
| `app/layout.js` | Root layout, theme/sidebar pre-paint script, menu + Active Orders badge, logout |
| `app/Shell.js` | Sidebar, topbar (titles, search, theme, refresh), toasts from `?ok=` / `?error=` |
| `app/ui.js` | Client pieces: `Modal`, `ModalFoot`, `RouteDialog`, `PlantStatus`, `FileDrop`, `ClickRow`, `Submit`, `PasswordInput`, `PrintButton`, `LinkBusy` |
| `app/globals.css` | Design system (FMS) + printable document styles |
| `app/login/page.js` | Sign-in |
| `app/orders/page.js` | Orders list, tiles, Actions column, renders the Order dialog for `?view=` |
| `app/orders/OrderDialog.js` | Order Profile dialog |
| `app/orders/OrderActions.js` | Approve/Reject, Generate DO, Dispatch, Generate PI, Upload Invoice dialogs |
| `app/orders/DispatchModal.js` | Dispatch dialog (one line or every open line of a DO) |
| `app/orders/actions.js` | Server actions: create quote, decide, plant status, DO, dispatch, undo, short close, PI, cancel, upload (each logs a timeline event) |
| `app/plant/page.js` | Plant Dispatch page |
| `app/orders/new/*` | New Quotation page + form |
| `app/orders/[id]/page.js` | Redirects old links to `/orders?view=ID` |
| `app/orders/[id]/print/[doc]/*` | Printable Quotation / Delivery Order / PI |
| `app/orders/[id]/tax-invoice/route.js` | 60-second signed link to the uploaded tax invoice |
| `app/admin/*` | Users, Customers/Items masters, their server actions |
| `lib/tas.js` | Company details, roles, masters config, M2/totals/VAT maths, formatting |
| `lib/server.js` | Supabase clients, `currentUser`, `requireRole`, `go` (redirect + toast), queues, `findOrder`/`getOrder`, `orderHistory`, `logEvent` |
| `proxy.js` | Session refresh + login redirect |
| `supabase/*` | Schema, seed + generator, migrations 001, 002 and 003 |

### Security model
- Browser never talks to Supabase. Every read/write goes through server code with the service-role key.
- Every table has RLS enabled and **no policies**, so the anon key can read nothing.
- `requireRole()` guards every page and server action; admin passes every check; sales only sees own orders.
- DB functions revoked from `public`, `anon`, `authenticated`.
- Users are created by the admin (`email_confirm: true`, no verification email); deactivated users are locked out.

### Environment (`.env.local`)
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — see `.env.example`.

---

## 6. Printable documents

| Doc | Form no. | Title | Blank-padded rows | Shows |
|---|---|---|---|---|
| Quotation | F.NO:-TAS/SALE/01 | QUOTATION | 11 | quoted qty / M2 / price / totals, 8 payment terms, signatures, bank |
| Delivery Order | F.NO:-TAS/SALE/04 | DELIVERY ORDER | 14 | delivered lines only, width/length, pcs, M2 subtotal |
| Proforma Invoice | F.NO:-TAS/SALE/02 | PROFORMA INVOICE | 12 | invoiced lines, bill-to/ship-to, totals, remarks, SAR + USD bank details |

All use the TAS letterhead, navy text, red table headers and red footer bar, and fit one A4 page.

---

## 7. Known limits (deliberate simplifications)

- Orders list: 100 per page; admin masters: 50 per page.
- New Quotation customer picker loads up to 1,000 customers (Supabase row cap) — switch to search beyond that.
- Tax invoice upload max 4 MB (Vercel request limit).
- One DO and one PI per order (user decision).
- No email notifications — the Active Orders badge replaces them.
- Customer codes in the seed were generated (`CUS-001…`); the source file had none.
- Theme / collapsed-sidebar preference is per browser (localStorage).

## 8. Design-check exceptions (`.impeccable/config.json`)
- `bounce-easing` for `var(--spring)` — false positive: the curve has no overshoot (copied from FMS).
- `layout-transition` in `app/globals.css` — sidebar width and search-pill width animations copied from FMS.

## 9. Sessions involved
- **This session** — build, Supabase hookup, FMS design, dialogs, Active Orders, DO-before-PI.
- **"App workflow audit"** — migrate-001, cancel / duplicate / price note / queues; migrate-003 plant dispatch
  (plant role, line-by-line dispatch with part quantities, undo, short close, plant line status, timeline).
