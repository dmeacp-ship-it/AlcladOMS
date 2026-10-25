# TAS OMS — Product Log

Running record of what the TAS Order Management web app is, every decision made, every change shipped,
and what is still open. Newest status first, then decisions, then the full change history.

- **Product:** TAS OMS — quotation → approval → plant ready → Delivery Order + dispatch → Proforma Invoice → tax invoice,
  for TAS International Manufacturing Company (ALCLAD / ALUMAX), Al Kharj, KSA.
- **Replaces:** the "FMS- OMS SAUDI" Google Sheet + Apps Script (`../1_Code_Setup.txt`,
  `../2_Code_Quotation.txt`, `../3_PI_DN_Invoice.txt`, `../4_PDF_Export.txt`).
- **Location:** `C:\Users\Admin\Desktop\APPS\Saudi Projects\tas-oms`
- **Stack:** Next.js 16.4 (App Router, plain JavaScript, Server Actions) · React 19 · Supabase
  (Postgres + Auth) · Google Drive (tax invoice files) · Phosphor icons · no CSS framework.
- **Code:** GitHub `dmeacp-ship-it/AlcladOMS` (**private**), branch `main`.
- **Hosting:** Vercel project `alclad-oms` (Hobby plan), deploys on every push to `main`.
  Runs locally with `npm --prefix tas-oms run dev`.

---

## 1. Current status (2026-10-24)

| Area | State |
|---|---|
| Tests (`npm test`) | ✅ 2/2 passing (quotation maths + ready/balance helpers; CSV round trip) |
| Dev server | ✅ every page and export loads (checked in the browser, desktop + 375px phone, light + dark) |
| `next build` | ⚠️ not re-run locally this session — Vercel builds on deploy |
| Supabase project | `viamcradzcvimekymbcu` — keys in `.env.local` (git-ignored) |
| Migrations 001–008 | ✅ run |
| `migrate-009.sql` (one query for all order counts) | ⚠️ **NOT run yet** — until it is, the app counts the old way (correct, just more queries) |
| Google Drive (tax invoices) | ✅ connected with an OAuth refresh token; test upload / read / delete passed |
| Users | 1 admin (`dme.acp@virgoasia.com`, username `hemant`) |
| Orders | 1 — `Q-2026-001`, APPROVED, fully dispatched in 3 DO batches with PIs |
| GitHub | `main` pushed through `c3c4492` (re-audit fixes); this log update is the next push |
| Vercel | Deploys work when commits are authored by `dmeacp-ship-it` (repo git config set; see §4, 19) |

### To do next (in order)
1. Run `supabase/migrate-009.sql` in Supabase → SQL Editor.
2. Push: `git -C "C:\Users\Admin\Desktop\APPS\Saudi Projects\tas-oms" push origin main` and check Vercel shows **Ready**.
3. Add the Google settings to Vercel → Settings → Environment Variables if not there yet
   (`GOOGLE_DRIVE_FOLDER_ID`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`), then redeploy.
4. Security clean-up: remove the first OAuth Playground grant (myaccount.google.com/permissions → OAuth 2.0
   Playground); reset the Google client secret (it was pasted in chat) and update `.env.local` + Vercel;
   if this chat may be shared, rotate the Supabase service-role key too.
5. Supabase → Authentication → turn **off** "Allow new users to sign up" (only the admin creates users).
6. Create the real users (sales / approver / operations / accounts / plant), with usernames.
7. Try the untested-on-live-data paths: a real **Edit order**, a customers **Import** (Export → re-import the same file),
   a tax invoice upload on Vercel, and the approval rules in Company Settings.
8. Fix customer codes / CR / mobile under **Customers** if the live sheet differs (seed generated `CUS-001…`).

---

## 2. Workflow and roles (current)

**Flow:** Quotation → Approval → plant marks lines **ready** → **Generate DO & dispatch** (a batch; several per order,
part quantities allowed) → **Proforma Invoice per DO batch** → **tax invoice per PI** (stored in Google Drive).

| Step | Who | Where | Rules |
|---|---|---|---|
| Create quotation | sales, admin | New Quotation | Customer + salesperson required; sales users only see customers assigned to them or unassigned; every line attribute must exist in the Item Master; qty > 0; VAT from Company Settings, stored on the order; credit-limit warning; confirm dialog; quotes below the auto-approve amount are approved on submit |
| Approve / Reject | approver, admin | Active Orders row, order dialog | Reject needs a reason; quotes above the admin-approval amount need an admin |
| Cancel order | approver, admin | order dialog (phones: More) | Reason required; only before any DO |
| Plant status / mark ready | plant, admin | Plant Dispatch, order dialog | Pending / Under Production / Ready for Dispatch / Coil N/A (+ date); ready qty added per line |
| Generate DO & dispatch | operations, plant, admin | Active Orders row, order dialog | From ready lines; qty ≤ balance; truck details; creates a DO batch + dispatch rows; then opens Generate PI |
| Undo dispatch / Short close | plant, approver, admin | order dialog | Reason for short close; balance won't ship |
| Generate PI | accounts, admin | per DO batch | Invoice qty ≤ DO qty; changed unit price needs a reason |
| Upload tax invoice | accounts, admin | per PI batch | PDF or image, max 4 MB, saved to the Google Drive folder; replacing deletes the old file |
| Duplicate quotation | sales, admin | order dialog | `/orders/new?from=ID` |
| **Edit order** | admin | order dialog → Edit order | Customer, salesperson, notes, transport, lines; can't go below dispatched qty or remove a line on a DO; logged in the timeline |
| **Delete order** | **admin only** | order dialog / row | Removes every batch's tax invoice file; logged in the activity log |
| Settings | admin | sidebar → Settings popover | Company, Customers, Items, Users, Activity Log |
| Reports | admin | sidebar → Reports | Overview, Salespeople, Customers, Waiting, Dispatch |

- **Roles:** `admin` (everything), `sales` (own orders only), `approver`, `operations`, `accounts`, `plant`.
- **Sign-in:** email **or username**; Logout ends only this browser's session.
- **Numbers (editable prefixes, Company Settings):** quotes `<Q>-YYYY-NNN` (digits and starting number set there);
  DO / PI per batch `<DO|PI>-<customer code>-DDMMYY-NN`. Numbers already issued never change.
- **VAT:** % set in Company Settings; each order keeps the rate it was quoted with.
- **Timezone:** Asia/Riyadh for all dates.

### Screens
- **Login** — email or username + password.
- **Sidebar order:** Active Orders, New Quotation, Plant Dispatch, All Orders, Reports; Settings popover above the
  profile card (name only). Phones: icon rail with a short label under each icon.
- **Active Orders / All Orders** (`/orders`) — tiles, search, Export (admin), Actions column, Docs menu.
- **Order Profile dialog** (`/orders?view=ID`) — tracker, next-step note, details, batches, items, dispatch
  history, documents (all open in the built-in viewer), timeline; phones fold secondary actions behind **More**.
- **New Quotation / Edit order** — same form; warns before leaving with unsaved changes.
- **Plant Dispatch** (`/plant`) — line tiles, plant status pill, mark ready (single or selected lines).
- **Print pages** (`/orders/ID/print/quote|do|pi`) — A4, company details/terms/letterhead from Company Settings;
  the tab title is the document number, so "Save as PDF" suggests e.g. `DO-CUS-115-231026-03.pdf`.
- **Settings → Company** (`/admin/settings`), **Customers / Items** (import + export), **Users** (username,
  last sign-in, sign out everywhere), **Activity Log** (`/admin/activity`, filters + export).
- **Reports** (`/admin/reports…`) — tabs: Overview, Salespeople, Customers, Waiting, Dispatch; shared date range;
  CSV downloads (one Download menu on phones).

---

## 3. Decisions (who decided what, and why)

| Date | Decision | Decided by |
|---|---|---|
| 2026-10-23 | Rebuild the Apps Script system as a login-based web app: Node.js (Next.js) + Supabase | User |
| 2026-10-23 | Approval moves from the emailed one-click link to an in-app **role** (approver) | User |
| 2026-10-23 | 5 roles: admin, sales, approver, operations, accounts | User (picked from options) |
| 2026-10-23 | Frontend: **Next.js** | User |
| 2026-10-23 | Documents as **printable pages** (browser Save as PDF), not stored PDF files | User |
| 2026-10-23 | Keep **one DO and one PI per order** (same as the sheet) — *later replaced by DO/PI batches (migrate-004)* | User |
| 2026-10-23 | Seed masters from `Ref files` xlsx (Supplier List → customers, RM-Finish Goods SKU → items) | User |
| 2026-10-23 | **Start fresh** — no import of old sheet orders | User |
| 2026-10-23 | User's own Supabase project; host on **Vercel** | User |
| 2026-10-23 | Defaults taken (not asked): Supabase Auth email+password, admin creates users (no self sign-up, no verification email), salespersons are Sales-role users, in-app pending list instead of email, English UI, Riyadh timezone | Claude (announced) |
| 2026-10-23 | All DB access server-side with the service-role key; RLS on with **no policies** | Claude |
| 2026-10-23 | Workflow additions: cancel order, duplicate quote, price-change reason, Awaiting PI/DN/Tax queues, PI before DN | "App workflow audit" session |
| 2026-10-23 | UI must follow `GAS FMS\Stylesheet.html` exactly, with **red instead of indigo** as primary | User |
| 2026-10-23 | Orders open as an FMS-style **dialog** over the list; actions in dialogs | User |
| 2026-10-23 | Rename "Orders" → **All Orders**; "Pending Approval" → **Active Orders** with per-row action buttons | User |
| 2026-10-23 | On-screen wording **DO / Delivery Order**; printed title **DELIVERY ORDER** | User |
| 2026-10-23 | **Flow corrected: DO before PI** | User |
| 2026-10-23 | Plant role + plant workflow (from GAS FMS); plant comes after the DO, part quantities allowed | User |
| 2026-10-23 | DO by operations; truck details per dispatch; Undo + Short Close; plant line status; Timeline | User accepted Claude's suggestions |
| 2026-10-24 | Fix every UI audit finding (two impeccable audits + one UI/UX audit) | User |
| 2026-10-24 | Only **admins** can delete orders (any role could before) | Claude (found in review, announced) |
| 2026-10-24 | Tax invoices stored in **Google Drive** (folder "Aluclad", `1xG-vG5F…`) instead of Supabase Storage; old uploads still open | User |
| 2026-10-24 | Drive sign-in via **OAuth refresh token** (Workspace blocks service-account keys by org policy; user isn't org admin) | User picked option B |
| 2026-10-24 | Code on **private** GitHub repo `dmeacp-ship-it/AlcladOMS`; repo made private before the first push (seed has real customers, code has bank details) | User |
| 2026-10-24 | Favicon: **red tile with factory**; same mark in the sidebar logo; page names in tab titles | User |
| 2026-10-24 | Admin links in a **Settings popover** above the profile card | User |
| 2026-10-24 | Sign in with **username or email** | User |
| 2026-10-24 | Admin tools: Company settings, activity log, Excel (CSV) import/export, user controls, approval rules, reports, number formats, customer salesperson + credit limit, **admin order edit** | User ("all") |
| 2026-10-24 | Excel files as **CSV** (Excel opens/saves them; no new dependency) | Claude (announced) |
| 2026-10-24 | VAT rate stored per order | Claude (so a rate change never alters old quotes) |
| 2026-10-24 | Logout signs out **this browser only** | Claude (bug: default was every device) |
| 2026-10-24 | Each report on its **own page** with tabs | User |
| 2026-10-24 | Sidebar order: Active Orders, New Quotation, Plant Dispatch, All Orders, Reports; no role tag on the profile card | User |
| 2026-10-24 | Further feature ideas (payments, notifications, price list, …) offered — **declined** | User |

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

### 2026-10-23 — 9. Plant dispatch (App workflow audit session)
- `supabase/migrate-003.sql` (+ `schema.sql`): `plant` role; line plant status Pending / Under Production / Coil N/A
  (+ `coil_date`); `dispatched_qty` and generated `balance_qty` per line; `orders.dispatch_status` +
  `short_close_reason`; `dispatches` and `order_events` tables; `record_dispatch`, `undo_dispatch`,
  `refresh_dispatch_status`.
- App: Plant Dispatch page (`/plant`) + menu item with badge; dispatch badge in every orders list; Awaiting Dispatch
  tile/queue; dialog tracker step, per-line dispatch columns, Dispatch History + Undo, Short Close, Timeline.

### 2026-10-23 — 10. Multi-batch DO / PI (another session; recorded from the files)
- `migrate-004.sql`: `order_batches` + `batch_items` (several DO batches per order, each with its own PI),
  `ready_qty` per line, "Ready for Dispatch" plant status, `generate_batch_do` / `generate_batch_pi`, `assign_batch_no`.
- `migrate-005.sql`: one tax invoice per batch (`order_batches.tax_invoice_path`).
- `migrate-006.sql`: DO / PI numbers without slashes (`DO-CUS-115-231026-01`).

### 2026-10-24 — 11. Impeccable UI audit #1 (12/20) and fixes
- Customer / salesperson / role pickers made keyboard-usable (real combobox ARIA, Tab/arrows/Enter/Esc,
  required check still runs); dialogs named by their titles; no "[object Object]" button names.
- Missing `b-teal` / `b-blue` badge colours added; colours moved to tokens (buttons, status pills, chevrons);
  OS dark-mode default; touch targets ≥ 24px desktop / 44px touch; phone dialog footer two-up; `100dvh`.
- Removed decorative blurs/`will-change`; raw DB errors replaced with plain messages.
- Shared `balanceOf` / `readyOf` helpers replaced six copies of the same calculation.

### 2026-10-24 — 12. Bugs found along the way
- Short Close crashed after succeeding (used an undefined variable) — fixed.
- Deleting an order left other batches' tax invoice files behind — now removes all, after the delete succeeds.
- `app/orders/DispatchModal.js` (unused) deleted.

### 2026-10-24 — 13. Tax invoices in Google Drive
- `lib/drive.js`: OAuth sign-in (refresh token, or service-account JSON), upload into the folder as
  `Q-… - PI-… - file.pdf`, stream back through `/orders/ID/tax-invoice` (app permissions still apply), delete.
  `tax_invoice_path` holds `drive:<file id>`; older Supabase paths still open.
- Google Cloud project "TAS OMS", Drive API on, OAuth consent screen (Internal), client "TAS OMS Drive".
  Workspace org policy blocks service-account keys and the user isn't org admin, so the refresh-token route was used.
  Setup steps in `README.md`.

### 2026-10-24 — 14. GitHub + Vercel
- `git init`, private repo, first commit `aa919c2`; `.env.local` never committed.
- Vercel blocked a deploy because the commit author (personal Gmail) isn't the Vercel account owner → repo git
  config set to `dmeacp-ship-it <dme.acp@virgoasia.com>`; user pushed an empty commit (`a201952`) to redeploy.

### 2026-10-24 — 15. Favicon, sidebar, titles, username
- `app/icon.svg` + `app/apple-icon.js` (red tile, factory); same mark in the sidebar logo; `proxy.js` lets the
  icons through so the sign-in page has them.
- Tab titles per page (`… · TAS OMS`); printed documents titled with the document number.
- `findOrder` cached per request (title + page share one fetch).
- Settings group → popover above the profile card.
- `migrate-007.sql`: optional unique `username`; sign-in accepts username or email.

### 2026-10-24 — 16. Admin tools (`migrate-008.sql`)
- `app_settings` (company, bank, terms, letterhead image, VAT %, number formats, approval rules) read by the
  documents and by `next_quote_no` / `assign_batch_no`; `orders.vat_rate`.
- Activity log keeps deleted-order and non-order entries (`order_events.order_id` nullable, `on delete set null`).
- Customers: `salesperson_id`, `credit_limit`. Users: `user_last_sign_in()`, `sign_out_user()`.
- Pages: Company Settings, Activity Log, Reports, Edit order; CSV import (customers by code, items skipping known
  descriptions) and exports (orders, lines, dispatches, invoices, customers, items, activity), paged past 1,000 rows.
- Disabling a user or changing their password ends their sessions; user changes, settings changes, imports and
  deletes are logged.

### 2026-10-24 — 17. Reports pages
- `lib/reports.js` + `app/admin/reports/{page,salespeople,customers,waiting,dispatch}` with shared tabs and period.

### 2026-10-24 — 18. UI/UX audit (8 items) and Impeccable re-audit (15/20, 8 items) — all fixed
- Search boxes named; placeholder contrast 5.7:1; skip link; phone sidebar labels; phone Reports tabs fade +
  Download menu; bigger checkboxes; no text under 11px; Waiting report icon for > 7 days.
- Section titles are real `h2` headings; `orderCounts()` + `migrate-009.sql` (one query for badges + tiles);
  phone **More** menu in the order dialog; `UnsavedGuard` on Settings / New Quotation / Edit order; batch DO/PI
  buttons use the document viewer; plant selection bar as a class; idle blurs and `transition: all` removed;
  `--on-accent` token.

### 2026-10-25 — 19. Two-pass audit (Impeccable + UI/UX Pro Max, 51 findings) — all fixed
- **Queues per DO batch:** `batchQueues()` in `lib/server.js`; AWAIT_PI / AWAIT_TAX / ACTIVE also count orders
  with a DO batch missing its PI or a PI batch missing its tax invoice. `migrate-013.sql` (optional) does the
  same in `order_counts()` and returns `V: 2`; until it runs the app counts those three queues itself. The
  order dialog's tracker and next-step banner read the batches ("Tax invoice 2 of 3").
- **Desktop:** orders table cut to 8 columns (Docs merged, qty under total, names wrap) and fits 1280+;
  quote number and Actions pinned when a table scrolls; sidebar starts as a rail at 769–1365 px (logo opens
  it, `localStorage.sb = open|col`); quote lines as two rows (inputs + description), cards at ≤ 1100 px.
- **Dialogs:** order profile reordered (items first, customer + timeline folded, Documents section only for
  legacy orders); Mark Ready shows the quantity right after the material and works across orders; typing in a
  dialog then Esc / backdrop / ✕ asks "Discard what you typed?"; delete of an order with documents needs the
  quote number typed; 4 MB / 1 MB file limits checked before upload; dialogs close with a 170 ms exit.
- **Menus:** combobox menu is fixed to the window (not clipped by dialogs), flips up, names wrap; tooltips only
  for icon-only controls and never on touch; Delete / Short Close red in More; errors stay until dismissed
  (`role="alert"`); entry animations use `backwards` fill so no transform is left on dialogs (it trapped fixed
  menus).
- **Phones:** five tabs max (More holds Reports, admin pages, theme, Log out); phone layout also for a phone in
  landscape (`(max-height: 500px) and (pointer: coarse)`); 16 px body; 44 px fields; queue tiles as chips;
  compact rows for plant, order lines, customers, users, activity (filters behind a button); colour list as
  chips with a filter; drag the sheet header down to close.
- **System:** type in rem (12 px floor, less uppercase), motion tokens 150/250/350 ms, z-index scale, one
  on-screen date format (`day()`), status words in sentence case (`STATUS`, `DISPATCH`), `app/loading.js`
  and `app/error.js`, sortable orders / customers / report tables, two weekly charts on Reports, offline notice,
  `/login` redirects signed-in users, Plant badge counts open lines.

### 2026-10-25 — 20. Performance audit and fixes (11 items)
- **Where the time went:** every page waited for 3 database trips in a row (~280 ms each from India), and the
  live app's functions run in Washington (iad1) while Supabase is in Sydney (AWS ap-southeast-2, found from the
  database address). `vercel.json` now pins functions to `syd1`, next to the database (takes effect on deploy).
- **Fewer trips:** the layout loads profile, counts and the usage warning together; the Orders page starts the
  open order, its history and (Active / Awaiting PI / Awaiting tax only) the batch queues with the user check
  (`fetchOrder()` without a permission check, `findOrder()` checks); New Quotation starts the batch queues with
  the masters; Activity and Plant run their role check alongside their queries.
- **`migrate-014.sql` (optional):** `order_counts()` V 3 adds `LINES` (Plant badge, counted in SQL instead of
  reading every approved line), `plant_counts()` (five tab counts in one call), `activity_filters()` (instead of
  reading 5,000 events). Until it runs the app falls back to the old queries.
- **Plant list:** filtered by tab in the query (`balance_qty`) instead of the newest 300 lines of every approved
  order, so open lines on older orders no longer drop off. Search fixed: it errored on every term
  (`orders.description` doesn't exist); it now matches material, quote no, DO no or customer.
- **Lighter pages:** row and dialog actions (`OrderActions`) are client components that build their dialogs when
  opened, and get only `actionData()` (lines only while an action needs them); list payload 2.8 → 1.8 KB per order.
  Icon font cut to the 79 icons in use (`app/icons/`, `npm run icons`; `npm test` fails on a missing one):
  206 KB → 13 KB. Usage warning failures cached for the hour (Company Settings reads fresh).
  Customers past 1,000 load (`fetchAll`). Tiles, tabs, sort headers and pagers show a spinner while loading.
- **Measured (old and new build side by side, this PC):** pages 835–990 → 570–720 ms on open connections;
  order dialog data 1.4 → 0.9 s. This PC loses 1–2.5 s whenever several new connections to Supabase open at once
  (idle ones close after 4 s), which hides part of the gain on cold page loads here; Vercel next to the database
  doesn't have that cost. Reports: audit https://claude.ai/artifact/77pg8EAoFbZ4NKfrFb6gtE, before/after
  https://claude.ai/artifact/ASgetitVRsPdF333g9iTCG.
- **migrate-014 applied (same day):** checked from the app (V 3, LINES 2, Plant and Activity counts unchanged,
  anon refused). Plant Dispatch 839 → 368–386 ms and Activity 852 → 296–559 ms (one trip each); going to Plant
  578 → 306–317 ms; every page's first byte ~290 ms (the layout is one trip for every user). Pushed to main
  (146d0a5); the live `x-vercel-id` shows syd1. Live from India: pages 369–614 ms, order dialog ~0.4 s.
- **Skeleton removed (`app/loading.js`):** with a fast server it painted first and React then held the finished
  content back until 300 ms after it (plus the 250 ms fade-in): live All Orders arrived by ~0.45 s but showed at
  ~1.1 s. Pages now arrive complete in the first paint (locally All Orders 908–960 → 692–828 ms, New Quotation
  908–924 → 676 ms). Feedback while moving between pages: the Shell shows the top bar for every link the app
  opens itself (Next's Link cancels the browser's navigation) until the URL changes, 10 s at most.

---

## 5. Architecture

### Files
| Path | What |
|---|---|
| `app/layout.js` | Root layout, theme pre-paint, sidebar nav + Settings links + badges (`orderCounts`), logout (this browser) |
| `app/Shell.js` | Sidebar (Settings popover), topbar titles, skip link, toasts |
| `app/ui.js` | `Modal`, `ModalFoot`, `RouteDialog`, `DocView`, `DocsMenu`, `Combobox`, `RoleSelect`, `FootMore`, `UnsavedGuard`, `PlantStatus`, `FileDrop`, `ClickRow`, `Submit`, `PasswordInput`, `PrintButton`, `LinkBusy` |
| `app/globals.css` | Design system (FMS) + printable document styles |
| `app/icon.svg`, `app/apple-icon.js` | Favicon and iPhone icon |
| `app/letterhead/route.js` | Letterhead image (uploaded one, else `public/letterhead.png`) |
| `app/login/page.js` | Sign-in (email or username) |
| `app/orders/page.js` | Orders list, tiles, Export, renders the Order dialog for `?view=` |
| `app/orders/OrderDialog.js`, `OrderActions.js` | Order Profile dialog; per-order action dialogs |
| `app/orders/actions.js` | Server actions: create / edit quote, decide, plant status, ready, DO, PI, undo, short close, cancel, upload, delete |
| `app/orders/new/*` | Quotation form (new + edit), `data.js` loader (customers, credit exposure, VAT) |
| `app/orders/[id]/edit/page.js` | Admin Edit order |
| `app/orders/[id]/print/[doc]/*` | Printable Quotation / Delivery Order / PI |
| `app/orders/[id]/tax-invoice/route.js` | Opens the tax invoice (Drive stream or old Supabase signed link) |
| `app/plant/*` | Plant Dispatch page + mark-ready dialog |
| `app/admin/settings`, `activity`, `reports/*`, `export/[what]`, `[master]`, `users`, `actions.js` | Admin pages, CSV export route, server actions (users, masters, settings, import) |
| `lib/tas.js` | Defaults, roles, masters config, M2/totals/VAT maths, `balanceOf` / `readyOf`, formatting |
| `lib/server.js` | Supabase clients, `currentUser`, `requireRole`, `go`, `QUEUES`, `orderCounts`, `fetchAll`, `findOrder`, `orderHistory`, `logEvent` |
| `lib/settings.js` | `getSettings()` with defaults |
| `lib/drive.js` | Google Drive upload / open / delete |
| `lib/csv.js`, `lib/activity.js`, `lib/reports.js` | CSV in/out, activity query, report data |
| `proxy.js` | Session refresh + login redirect (icons exempt) |
| `supabase/*` | Schema, seed + generator, migrations 001–009 |

### Security model
- Browser never talks to Supabase. Every read/write goes through server code with the service-role key.
- Every table has RLS enabled and **no policies**, so the anon key can read nothing.
- `requireRole()` guards every page and server action; admin passes every check; sales only sees own orders
  and their assigned / unassigned customers (checked on the server too).
- DB functions revoked from `public`, `anon`, `authenticated`.
- Users are created by the admin; deactivated users are locked out and their sessions ended.
- Tax invoice files are private in Drive and streamed through the app.

### Environment (`.env.local`, also needed in Vercel)
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_DRIVE_FOLDER_ID`, `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` (or `GOOGLE_SERVICE_ACCOUNT_JSON`) — see `.env.example`.

---

## 6. Printable documents

| Doc | Form no. | Title | Blank-padded rows | Shows |
|---|---|---|---|---|
| Quotation | F.NO:-TAS/SALE/01 | QUOTATION | 11 | quoted qty / M2 / price / totals, quotation terms, signatures, bank |
| Delivery Order | F.NO:-TAS/SALE/04 | DELIVERY ORDER | 14 | the batch's DO lines, width/length, pcs, M2 subtotal |
| Proforma Invoice | F.NO:-TAS/SALE/02 | PROFORMA INVOICE | 12 | the batch's invoiced lines, bill-to/ship-to, totals, remarks, SAR + USD bank details |

Letterhead, company/bank details and terms come from Company Settings; VAT % from the order. Documents are drawn
when opened (not stored), so editing company details changes how old documents print.

---

## 7. Known limits (deliberate simplifications)

- Orders list: 100 per page; admin masters: 50 per page; activity log: 100 per page.
- New Quotation customer picker sends every customer to the browser — switch to search once there are thousands.
- Icons: only those in `app/icons/phosphor.css` exist; after using a new `ph-*` icon run `npm run icons`
  (Python with fonttools + brotli).
- Tax invoice upload max 4 MB (Vercel request limit); letterhead image max 1 MB (stored in the database).
- Drive uploads run as the Google account that made the refresh token; if it's disabled or revokes "TAS OMS",
  uploads stop until the OAuth Playground step is repeated.
- Excel import/export is CSV (Excel → Save As → CSV UTF-8).
- No email / WhatsApp notifications — the Active Orders badge replaces them.
- Customer codes in the seed were generated (`CUS-001…`); the source file had none.
- Theme / collapsed-sidebar preference is per browser (localStorage).
- `order_counts()` (SQL) and `QUEUES` (JS) define the same queues — change both together; so do
  `plant_counts()` (SQL) and `SHOWS` in `app/plant/page.js`.
- Long admin tables still scroll inside their card on desktop so the column headers stay in view.

## 8. Design-check exceptions (`.impeccable/config.json`)
- `bounce-easing` for `var(--spring)` — false positive: the curve has no overshoot (copied from FMS).
- `layout-transition` in `app/globals.css` — sidebar width animation copied from FMS (the search-pill width
  animation was removed in audit #1).

## 9. Sessions involved
- **Build session** — build, Supabase hookup, FMS design, dialogs, Active Orders, DO-before-PI.
- **"App workflow audit"** — migrate-001, cancel / duplicate / price note / queues; migrate-003 plant dispatch.
- **Batch DO/PI work** — migrate-004…006 (not recorded in detail here).
- **This session (2026-10-24)** — audits and fixes, Google Drive, GitHub + Vercel, favicon/titles, usernames,
  admin tools (migrate-007…009), reports, sidebar changes.
