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

## 0. Inventory (IMS) for the new factories — task tracker

Updated after every task. Phase 1 is on `main` (commit `67a845f`); Phase 2 is on `main` (commit `ba78ba1`) and live. Who uses it for now: admin + manager.
Decided 2026-10-27: build for the new factories (not a copy of the old Virgo sheets); granules plant later but keep
room for it; no QR codes yet; no BOM yet (manual issue); manager creates POs, admin approves; GRN may be 2% over the PO.
Phase 2 decided 2026-10-27: two separate inventories — **RM** (KG, PO → GRN → issue → used in production) and **FG**
(pieces per product + size, M2 calculated; in only from production after QC, out only by DO). Sales touches FG only;
RM and FG meet only at the production entry. No work order per sales order: shortages of all orders are grouped by
item + size into a daily production plan. Mark ready stays manual (it reserves FG); auto-reserve oldest-first is a
setting, off. Shifts Day / Night; B-grade = same item + "-B"; rejects recorded only; FG min stock later.

Status: ✅ done · 🔄 in progress · ⏳ pending · 👤 needs you

| # | Phase | Task | Status | Date | Notes |
|---|---|---|---|---|---|
| 1 | 1 | Database: `migrate-015.sql` (tables, numbering, stock functions) | ✅ | 27 Oct | Checked on an in-memory Postgres: `npm run test:sql` |
| 2 | 1 | Run `migrate-015.sql` on Supabase (Mumbai) | ✅ | 27 Oct | Checked from the app: 12 tables, `stock_summary()`, store links all respond |
| 3 | 1 | Masters: Plants, Stores, Materials, Vendors (add / edit / import / export) | ✅ tested | 27 Oct | Settings menu, admin only. Import not clicked (same code as Customers) |
| 4 | 1 | Purchase Orders: create, approve / reject, close, print | ✅ tested | 27 Oct | Create, approve, print, auto-close tested; reject / Close PO not clicked |
| 5 | 1 | GRN on a PO + incoming QC (accepted → stock, rejected → back to pending), print | ✅ tested | 27 Oct | 505 of 500 received (2% rule), 5 rejected with reason, 500 into stock |
| 6 | 1 | Issue / transfer store → line (WIP) or store, print | ✅ tested | 27 Oct | Over-stock issue refused; 200 issued |
| 7 | 1 | Opening stock (CSV, once) + adjustments with reason | ✅ tested | 27 Oct | Adjustment −10 tested; opening CSV checked only in `test:sql` (file upload can't be driven in the test browser) |
| 8 | 1 | Stock report (opening / in / out / closing, below-min red, CSV) | ✅ tested | 27 Oct | RM 500 − 200 − 10 = 290 (red, min 400), Line 1 = 200; CSV matches |
| 9 | 1 | Click-through test in the browser (desktop + phone) | ✅ | 27 Oct | On live data with TEST records, all removed afterwards; numbering reset to 001 |
| 9a | 1 | Fixes from the test (see change history 21) | ✅ | 27 Oct | Fields kept after an error, phone layout, WIP not "below min", unit KG by default |
| 9b | 1 | Run `supabase/migrate-016.sql` (clearer "not enough stock" message) | ✅ | 27 Oct | Run by the user in the SQL Editor |
| 10 | 1 | Enter the real Plants, Stores, Materials, Vendors | 👤 | | Settings → each master, or Import CSV |
| 11 | 1 | Load the opening stock | 👤 | | Inventory → Opening & Adjust |
| 12 | 1 | Commit, merge to `main`, deploy on Vercel | ✅ | 27 Oct | `67a845f` on `main` (fast-forward from `inventory`); Vercel build **success**; live `/inventory` answers from bom1 |
| 13 | 2 | FG inventory (separate from RM): FG items = product + size, own ledger, pcs + M2; FG opening stock CSV | ✅ tested | 27 Oct | `migrate-017.sql`; Production & FG → FG Stock (report, CSV, opening load, adjustment). Every order line gets its FG item automatically |
| 14 | 2 | OMS ↔ FG: Mark ready (manual) reserves FG pieces of that item + size; DO takes them out of FG; undo dispatch puts them back | ✅ tested | 27 Oct | Plant Dispatch + Mark ready dialog show "FG free"; a DO refused by the database now shows why instead of falling back. Order dialog columns not changed |
| 15 | 2 | Settings: auto-reserve oldest order first (off), "Orders use FG stock" (off until FG opening stock is in), FG store orders ship from | ✅ tested | 27 Oct | Company Settings → Inventory. The two FG options became one: "Orders use FG stock" (Mark ready limited to free FG + DO takes FG out) |
| 16 | 2 | Planning board: shortages of all open orders grouped by item + size → daily Production Plan (line, shift, items, pcs) | ✅ tested | 27 Oct | Production & FG → Planning: needed / FG free / planned / in QC / short per item, with the quote numbers; plan sheet prints. No work order per order |
| 17 | 2 | Plan ↔ RM: plan shows M2 to make and RM stock; issue RM to the line against the plan | ✅ tested | 27 Oct | Plan page lists RM in the plant's RM stores and on the line; "Issue RM to this line" opens Issue pre-filled and links it to the plan |
| 18 | 2 | Production entry (DPR) per date + shift (Day / Night) + line: good / rejected pcs per plan line, RM used (kg) | ✅ tested | 27 Oct | From a plan ("Enter production") or free; RM used comes off the line's stock (refused if more than was issued); plan closes itself when fully produced; DPR prints |
| 18a | 2 | FG QC: pass → FG, B-grade → same item + "-B" into FG, reject → recorded only (scrap weight in phase 3) | ✅ tested | 27 Oct | Production & FG → FG QC; pass goes into the FG store of the line's plant; auto-reserve runs after it when switched on |
| 18b | 2 | FG stock report (pcs + M2) and production / WIP / yield reports | ✅ tested | 27 Oct | FG Stock (reserved / free for the orders' store, CSV) and Reports (output per day / shift / line, rejection %, RM issued vs used per line, RM per M2) |
| 18c | 2 | Browser test (desktop + phone), product log, deploy | ✅ | 27 Oct | Tested on live data with TEST records (all removed); `ba78ba1` pushed to `main`, Vercel build **success**, live from bom1 |
| 18d | 2 | TEST data loaded in the live app for the user's own check | ✅ removed | 29 Oct | Removed per user request. Plant TEST, 5 test stores, 5 test materials, 2 test vendors, 3 test POs, 2 test GRNs, 3 test plans, 3 test DPRs, stock/FG moves, test customers (TEST-CA, TEST-CB), test orders Q-2026-001…003 deleted; settings: fg_store=null, fg_link=false; numbering reset. |
| E1 | Easy | Sidebar: one link per page, grouped Sales / Store / Production / Reports, red numbers for waiting work; tab bars inside pages removed | ✅ live | 27 Oct | Phone: the More menu keeps the same groups |
| E2 | Easy | Plain words: Receive Goods, Check the goods, Issue to Line, Stock Correction, Plan Production, Enter Production, Check Finished Goods, Finished Goods Stock; planning columns "Orders need / In stock / Already planned / Being checked / Still to make" | ✅ live | 27 Oct | Store types shown as "Production line", "Finished goods store"… |
| E3 | Easy | "To Do Today" start page | ❌ removed | 27 Oct | Removed per user preference; app lands on /orders |
| E4 | Easy | Help box with numbered steps at the top of every store and production page | ✅ live | 27 Oct | |
| E5 | Easy | Commit and deploy | ✅ | 27 Oct | `e9c9689` on `main`, Vercel build **success**, live from bom1 |
| E8 | Easy | Purchase orders open in a dialog box over the list (/inventory/po?view=ID) instead of a separate page | ✅ tested | 27 Oct | PODialog with RouteDialog, Slip, approve/reject/close actions, print styles |
| E9 | Easy | Collapsible sidebar sections (Sales, Store, Production, Reports) with carets, waiting badges, and auto-expand | ✅ tested | 27 Oct | Section headers toggle groups; collapsed state saved in localStorage; brand header pinned at top |
| E10 | Easy | Unified UI/UX in Inventory & Production: RouteDialogs for GRN, Issue, Plan, DPR; Combobox dropdowns across all forms | ✅ tested | 27 Oct | GRNDialog, IssueDialog, PlanDialog, DprDialog match OrderDialog; native selects replaced with Combobox |
| E11 | Easy | Removed Active Orders page from sidebar; renamed page to Orders | ✅ tested | 27 Oct | Sidebar simplified to Orders; /orders?status=ACTIVE redirects or filters via toggle |
| E12 | Easy | Toggle on Orders page: [ Active Orders ] [ All ], default selected to Active Orders | ✅ tested | 27 Oct | Segmented tab toggle in table header matching Receive Goods; defaults to Active Orders; one-click All |
| E6 | Easy | Language: Arabic and / or Hindi-Urdu labels | 👤 | | Your decision (English for now) |
| E7 | Easy | Separate logins per job (store, production, QC, purchase) so each person sees only their pages | 👤 | | Suggested next; same as task 26 |
| 19 | 3 | Scrap stock → granules plant (RM inward + sample test) | ⏳ | | |
| 20 | 3 | Granule production and transfer to the ACP plant | ⏳ | | |
| 21 | 4 | Purchase request from the min level (reorder list → PO) | ⏳ | | Phase 1 only shows below-min rows in red |
| 22 | 4 | BOM per FG item, auto-calculated issue | ⏳ | | When the standards are known |
| 23 | 4 | QR labels on coils / bags, scan to issue and dispatch | ⏳ | | |
| 24 | 4 | Stock count (cycle count) with approval | ⏳ | | |
| 24a | 4 | FG min stock per item + size (make for stock without orders); automatic Mark ready | ⏳ | | User: later |
| 25 | 4 | Dashboard: stock value, yield, rejection % | ⏳ | | |
| 26 | 4 | Separate roles: store, production, qc, purchase | ⏳ | | |

Known limits of phase 1: one lock for all stock postings (fine for a few users at once); min level is per material,
compared per store; the stock report lists only store + material pairs that have had a movement; the "no negative
stock" check looks at the balance today, not on a back-dated entry's own date.

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
- **Moved to Mumbai (2026-10-26):** live tile/page switches still took 0.4–0.7 s from India, nearly all of it the
  trip to Sydney (static files from the bom1 edge ~40 ms; a do-nothing function call ~375 ms). Users are in Saudi
  Arabia and India, and Supabase has no Gulf region, so the user created a new free project in Mumbai
  (ap-south-1, ref vaqrdlfzekvfstlbsvff) and `vercel.json` now pins functions to `bom1`. The copy was one SQL file
  run in the SQL Editor (schema.sql + migrate-004…014 + every table's rows with the same ids, identity counters
  moved on), tested first on a local Postgres; the 2 sign-in users were created through the Auth admin API with
  the same ids and their password hashes copied, so nobody resets a password; the tax-invoice files copied through
  Storage. Checked equal to Sydney: order_counts, next_quote_no (Q-2026-004), plant_counts, activity_filters,
  item_options, orders with lines and batches, profiles, app_settings; anon key sees nothing. A warm query from
  India: Mumbai 44–107 ms vs Sydney 283–326 ms. The Sydney project is kept, untouched, as a backup. Also:
  `staleTimes.dynamic: 30` — a list opened in the last 30 s shows again without a server trip.
  - Sign-in after the switch: the Auth admin API accepted `password_hash` on `updateUserById` but did not set it,
    so the hashes were set in SQL (`update auth.users set encrypted_password = …`, from the Sydney SQL Editor).
    A user can also be given a new password in SQL with `extensions.crypt('…', extensions.gen_salt('bf'))`.
    Vercel env changes only reach a new deployment. The login page now shows the real reason for any failure
    that isn't a wrong password ("Sign-in failed: … Tell the admin."), so a bad key isn't read as a typo.
  - Live after the move (8efbeaa, `x-vercel-id` bom1::bom1), from India: server time per tile/page 84–128 ms
    (was ~590 ms), tile clicks 151–207 ms (first click after a page load ~0.5 s), a tile revisited within
    30 s 11–13 ms, Plant Dispatch 393 ms. Tile counts and the next quote number are unchanged.
  - Left to do: give the Mumbai project new API keys (the service-role key was pasted in a chat) and update
    them in Vercel; delete the Sydney project once the user no longer wants it as a backup.

### 2026-10-27 — 21. Inventory phase 1 (branch `inventory`)
- **Why:** the user's new factories need an inventory system. The old Virgo plant's 17 Google Sheets (RM database,
  PO, inward, issue, consumption, WIP, DPR, FG QC, granules…) were read for the flow, but the new design is one stock
  ledger (`stock_moves`, + in / − out) instead of day-by-day columns and IMPORTRANGE links. Tracker in §0.
- **Built:** masters Plants / Stores / Materials / Vendors on the shared master screen (pick-lists for plant, store
  type, category; import matched on code); Inventory pages Stock, Purchase Orders, GRN & QC, Issue / Transfer,
  Opening & Adjust; PO, GRN and issue slips on the letterhead; every action in the Activity Log.
- **Rules in the database (`migrate-015.sql`):** numbering `PO-/GRN-/ISS-/ADJ-/OPN-YYYY-NNN`; GRN only on an approved PO,
  at most 2% over; nothing enters stock before QC; rejected qty goes back to pending; PO closes itself when fully
  received; no store can go below zero; opening stock only once per store + material.
- **Checks:** `npm run build` and `npm test` pass; `npm run test:sql` (new, PGlite dev dependency) runs the migration
  and the whole flow; migration run on Mumbai and checked from the app.
- **Click-through on live data (same day):** TEST plant, RM store, Line 1 (WIP), material, vendor → PO-2026-001
  (approved, printed) → GRN 505 KG (2% rule) → QC 5 rejected with reason, 500 into stock, PO closed itself →
  issue of 600 refused, 200 issued → adjustment −10 → stock report RM 290 (red under min 400), Line 1 200, CSV
  matches; desktop and 375 px phone, no sideways scroll. Every TEST row and its activity-log lines were then deleted
  and the document counters reset, so real numbering starts at 001.
- **Fixed from the test:** (1) after an error the header fields (stores, requested by) were wiped — forms now
  submit from `onSubmit` like New Quotation, so every typed value stays (`ActionForm`, also used by `LinesForm`);
  (2) the QC form lost typed values on an error — now the same form; (3) a production line (WIP) showed "below min"
  — min level now applies to stores only; (4) material lines on phones squeezed Qty off screen — they are now
  label / value cards; (5) the "not enough" message read "would leave −100.000 in stock" — `migrate-016.sql` changes
  it to "100 KG short" (run by the user the same day); (6) new materials start with unit KG and category RM.
- **Shipped (same day):** commit `67a845f` fast-forwarded onto `main` and pushed (author `dmeacp-ship-it`); Vercel
  build succeeded; the live app serves `/inventory` (sign-in required) from bom1. Next: the user enters the real
  masters and opening stock (§0 tasks 10–11), then phase 2.

### 2026-10-27 — 22. Phase 2: FG inventory, orders ↔ FG, production planning (migrate-017)
- **Design (user's call):** two inventories kept apart — RM in KG, FG in pieces per product + size (M2 calculated).
  Sales only touches FG; RM and FG meet only at the production entry. No work order per sales order: the planning
  board groups what all open orders still need by item + size, and one plan (date + shift + line) covers many orders.
  Mark ready stays manual and is the FG reservation; auto-reserve oldest-first is a setting (off).
- **Built:** `fg_items` (made automatically for every order line by a trigger, and from the FG opening CSV), `fg_moves`
  (FG ledger), planning board + plans, production entry (good / rejected pcs, RM used off the line), FG QC (pass /
  B-grade "-B" / reject), FG Stock (report, CSV, opening load, adjustment), Reports (output, rejection %, RM issued vs
  used per line, RM per M2). Sidebar: "RM Inventory" and "Production & FG". Company Settings → Inventory: FG store
  orders ship from, "Orders use FG stock", auto-reserve.
- **Existing flow changed:** the DO function also takes the pieces out of FG when "Orders use FG stock" is on (and
  refuses pieces reserved for other orders); undo dispatch puts them back (the FG entry is deleted with the dispatch).
  The DO action now shows a refusal from the database instead of silently using its old fallback path. Mark ready is
  limited to free FG (when on) and pre-fills only the free pieces; Plant Dispatch shows "FG free" per line.
- **Checks:** `npm run test:sql` now also loads schema.sql + every migration on PGlite and runs the Phase 2 flow
  (reservation, DO refusal, undo, plan, production, QC, auto-reserve, FG report). Browser test on live data with TEST
  plant / stores / coil / customer / order Q-2026-001: plan PLN-2026-001 for 10 → RM issue 60 kg → production 8 good + 2
  rejected, 70 kg refused ("10 KG short"), 50 kg used → QC 6 / 1 B / 1 → FG 6 + 1 B → link on: Mark ready 8 refused
  ("only 6 free"), 6 reserved → DO of 7 refused, DO of 6 made, FG 0 → undo, FG 6 again → FG adjustment −1 B-grade →
  reports (8 pcs, 24.50 M2, 20% rejection, 2.041 kg / M2). Phone and desktop. Then every TEST row, the activity-log
  lines and the counters were deleted and the settings set back (FG link off, no FG store).
- **Fixed from the test:** Mark ready pre-filled the whole balance even with less free FG — it now offers only what is
  free; the FG adjustment form said "Materials" — now "FG items (pieces)".
- **Not covered in the browser:** the FG opening CSV (the test browser can't attach files; the same SQL path is in
  `test:sql`) and auto-reserve (checked in `test:sql`).
- **Shipped (same day):** commit `ba78ba1` on `main`, Vercel build succeeded, live from bom1. Next for the user: add an
  FG store and the production lines (WIP stores), pick the FG store in Company Settings → Inventory, load the FG
  opening stock, then switch on "Orders use FG stock"; then phase 3 (granules) or phase 4 items.

### 2026-10-27 — 23. Easier to use (sidebar, plain words, To Do Today, page help)
- **Why:** the user found the app confusing; it is for people who rarely use computers.
- **Changed:** the Store and Production pages are now separate sidebar links in groups (no tab bars inside pages);
  the link of the page you are on is the only one lit (longest match). Red badges: purchase orders to approve
  (admin), deliveries to check, items still to make, production rows to check. New start page `/today` ("To Do
  Today"): one big box per kind of waiting work for the user's job (quotations to approve, orders waiting for a DO,
  lines to dispatch, PIs, tax invoices, POs, deliveries to check, materials below minimum, pieces still to make,
  production to check) and shortcut buttons; `/`, sign-in and the login page now go there. Every store / production
  page starts with a plain sentence and numbered steps (`app/PageHelp.js`). Jargon replaced in titles, columns,
  buttons and store types. The admin-only "pick the FG store" warning no longer shows to managers.
- **Checked:** desktop 1400 px and phone 375 px (no sideways scroll, grouped More menu), `npm test`, `next build`.
- **Open questions for the user:** Arabic / Hindi-Urdu labels; separate logins per job.
- **Shipped (same day):** commit `e9c9689` on `main`, Vercel build succeeded, live from bom1.

### 2026-10-28 — 24. Simpler order flow, phase 1 (+ role fix)
- **Why:** the user found the order flow confusing; proposal = 4 stages (Quote → Make → Ship → Bill), one owner and one button each.
- **Role fix:** `markReady` (plant, operations), `saveProduction` (plant), `generateBatchDO` (operations, plant) and
  `generateBatchPI` (accounts) used `requireRole()` with no role, so any signed-in user (sales too) could press them.
  Buttons are hidden for roles the server refuses (Ship, Make PI, Production Floor link).
- **Names:** Plant Dispatch → **Production Floor** (it marks pieces ready; it never dispatched). Generate DO & Dispatch →
  **Ship** ("Ship & make DO"). Generate PI → **Make PI**. Printed documents unchanged.
- **Tracker:** Quotation → Approved → **Ready** → **Shipped** → **Invoiced** (PI + tax invoice) → **Done**.
- **One "ready":** the plant status dropdown no longer offers Ready for Dispatch; it is Pending / In production / Waiting
  for coil (database values unchanged). Changing the status never touches the ready quantity any more (it used to reset
  it to 0); ready pieces come only from Mark ready.
- **Orders page:** the 9 tiles and the Active/All toggle are replaced by tabs **My Work** (single-job roles: approver →
  waiting approval, plant → not fully shipped, operations → pieces ready to ship, accounts → PI / tax invoice to do) ·
  **All Active** · **Everything**. Admin / manager land on All Active and get a **Filter** menu with the old queues.
  The Orders badge for single-job roles = the My Work count (`MY_WORK` / `myWorkIds` in lib/server.js).
- **Checks:** `npm test`, `next build`; the My Work queries run against the live database (read-only). Not clicked in
  the browser by the user's sign-in (admin): tabs, Filter, tracker, Ship / Make PI, Production Floor, status change keeps
  the 4 ready pieces (TEST order, set back). Other roles' hidden buttons not clicked (only an admin user exists).
- **Phone tab bar fix:** the collapsible sidebar sections (E9) wrapped the phone tab bar onto extra rows; on phones the
  section wrappers now use display: contents and the headers hide.
- **Shipped:** commit `21bfe69` on `main` (also carries the earlier uncommitted E8–E12 work), Vercel build success.

### 2026-10-28 — 25. Simpler order flow, phase 2 (ship from the floor, one billing step)
- **Ship from Production Floor:** a ready line has a **Ship N PCS** button that ships every ready line of its order (one
  Delivery Order, same dialog as Orders: `ShipAction` in `app/orders/OrderActions.js`); ticked ready lines of one order
  get **Ship selected** (lines of several orders: "Ship one order at a time"). After shipping you stay on Production
  Floor. Mark ready turns into a quiet button on lines that are already partly ready, so Ship is the main one.
- **Billing per shipment:** in the order dialog the section is "Shipments and billing"; the separate PI and Tax Invoice
  columns became one **Billing** column: "1 of 2: PI to make" → Make PI, "2 of 2: tax invoice to attach" → Attach tax
  invoice, then "Billed". Documents (DO, PI, tax invoice, Replace) sit in their own column. "Upload invoice" is now
  "Attach tax invoice" everywhere.
- **Phone:** a Production Floor card with both Add ready and Ship puts the buttons on their own line (the status
  dropdown was squeezed to "In ▾"); "Add ready (8 left)" is now "Add ready" (the balance is on the card).
- **Checks:** `next build`, `npm test`; in the browser (admin): Ship 4 PCS on Q-2026-001 opens the dialog with the ready
  line and returns to Production Floor; ticking that line shows Ship selected; the order dialog shows "Shipments and
  billing" with "1 of 2: PI to make" + Make PI; phone 375 px without sideways scroll. Ship and Make PI were not pressed
  (they would issue real DO / PI numbers).
- **Also:** `.impeccable/config.json` ignores border-accent-on-rounded in globals.css (the red rule on printed documents).

### 2026-10-28 — 26. Simpler order flow, phase 3 (factory sidebar regrouped)
- **Sidebar (admin, manager):** 11 store / production / report links → 7, in the order the work happens:
  **Buying** (Purchase Orders, Receive & Check) · **Factory** (Plan Production, Issue to Line, Record Shift, Stock) ·
  **Reports** (Reports). No page or feature removed; every old URL still works.
- **Shared links with tabs (`app/PageTabs.js`):** Record Shift = "1. Enter production | 2. Check pieces" (badge = pieces
  to check); Stock = "Raw material | Finished goods"; Reports = "Sales | Production" above the sales report tabs.
  A nav item's `match` list lets it light up on the pages it owns (Shell.js longest-match logic).
- **Stock Correction** is a button on Stock (raw material) next to Download CSV; the correction page shows the Stock tabs.
- "Receive Goods" is now "Receive & Check" (sidebar, title, help); top-bar titles follow the sidebar names.
- **Checks:** `next build`; in the browser (admin): every store / production / report page shows the right tabs and
  lights the right sidebar link; phone 375 px: More menu grouped Buying / Factory / Reports, tabs fit, no sideways scroll.
- Note: this brings back tabs inside pages (removed in E1) — only where pages share one sidebar link.

### 2026-10-28 — 27. Stores & Lines: two tabs
- **Why:** the user asked why lines and stores are saved together. They share one table on purpose (a line holds the RM
  issued to it, so issue = a move between two places and one stock report covers both); only the screen changed.
- Settings → **Stores & Lines** (`/admin/stores`) has tabs **Stores** (every type except production line) and
  **Production lines** (`?kind=lines`, type WIP), each with its count; on the lines tab "Add Production line" starts
  with the type set. Import / Export still cover both.

### 2026-10-29 — 28. Simplified order flow & pipeline tabs (without UI style changes)
- **Why:** User requested a simpler flow because bouncing between lists, filter dropdowns, and separate pages was confusing.
  UI style elements, fonts, colors, and GAS FMS layout tokens were strictly preserved as requested.
- **Dedicated Dashboard (`/`):**
  Replaced the `/` -> `/orders` redirect with an actionable Dashboard:
  - Header greeting + quick actions (New Quote, Production Floor, Plan Production).
  - 4 Order Lifecycle Cards (1. To Approve, 2. In Production, 3. Ready to Ship, 4. To Invoice) with live counts and 1-click links to queues.
  - Factory & Procurement Cards (Purchase Orders, Receive & Check, Shortages to Plan, FG QC).
  - Recent Activity table feed showing latest 6 events with clickable quote links.
- **Visual Workflow Stage Tiles on Orders (`/orders`):**
  Added clickable `.stats` tiles across the top of `/orders`:
  `All Active` · `1. To Approve` · `2. In Production` · `3. Ready to Ship` · `4. To Invoice` · `5. Tax Invoice`.
  Clicking any tile highlights it (`.stat.on`) and immediately filters the orders table below.
- **In-Dialog Mark Ready (`OrderDialog.js`):**
  Plant users can now mark finished pieces ready directly inside the Order Profile dialog via `MarkReadyModal` on open lines or for the whole order, eliminating the need to jump to `/plant` and hunt for lines in a separate 300-row list.
  Once pieces are ready, the dialog footer immediately activates `Ship (X PCS ready)`.
- **Table Row Actions (`OrderActions.js`):**
  Table rows for approved orders in production now show a direct shortcut link (`Floor`) to the plant floor for that quote instead of rendering an empty action cell.
- **Checks:** `npm test` passed (5/5), `npm run build` passed with zero errors (38 routes).

---

### 2026-10-29 — 29. Unified Buying / Purchase Orders & Row Actions
- **Why:** User requested to merge the two separate items under BUYING (Purchase Orders and Receive & Check) into one unified flow and provide action buttons on the table rows just like the Orders table.
- **Sidebar Consolidation (`app/layout.js`):**
  Merged the sidebar menu items under BUYING into a single unified Purchase Orders link (`/inventory/po`) with a combined badge of all actionable buying tasks (`inv.po + inv.grn`). Matched `/inventory/grn` so any legacy links keep the menu item highlighted.
- **Unified Action Buttons (`app/inventory/po/POActions.js`):**
  Added an Actions column to the Purchase Orders table with immediate, contextual row actions:
  - `Pending Approval`: Admin can 1-click **[Approve]** (with confirmation dialog) or **[Reject]** (with reason dialog) directly on the row.
  - `Approved with pending qty`: **[Receive Goods]** button (truck icon) opens the GRN receiving dialog directly for that PO, prefilled with items and quantities.
  - `Awaiting QC`: **[Check (QC)]** button (warning badge) directly opens the GRN inspection form to record accepted/rejected stock.
  - `Completely Received`: Green **[Received ✓]** status badge.
  - Quick **[View]** eye button on every row.
- **Unified View Switcher & Sub-tabs (`app/inventory/po/page.js`):**
  Added tabs at the top of the table to switch between Purchase Orders and Goods Received (GRN):
  - In Purchase Orders view: sub-tabs for Open, Pending approval, To Receive, Approved, Closed, Rejected.
  - In Goods Received (GRN) view: sub-tabs for Waiting to be checked and All, with direct **[Check (QC)]** row actions.
  - Top action buttons: `+ New PO` and `Receive goods`.
- **Clean Redirects & Zero-Hop Navigation:**
  Updated `app/inventory/grn/page.js`, `app/inventory/grn/new/page.js`, and `app/inventory/grn/[id]/page.js` to redirect seamlessly to `/inventory/po?tab=grn` and `/inventory/po?view_grn=...`.
  Saving a GRN automatically opens the QC dialog on `/inventory/po` so incoming materials can be checked into stock immediately without losing context.
- **Delivery Order Crash Resolved (`OrderDialog.js`):**
  Diagnosed and resolved reference error 127444677 (`readyLines` undeclared in component body after generating delivery order `DO-CUS-113-291026-01`). Verified `http://localhost:3000/orders?view=10` returns HTTP 200 cleanly.
- **UI & Style Elements Preserved:**
  All existing colors, fonts, CSS classes (`.tbl`, `.card`, `.badge`, `.btn`, `.tabs`, `.tab`), and GAS FMS layout tokens were strictly preserved as instructed.


### 2026-10-29 — 30. Simplified Factory Area: 2-Hub System
- **Why:** User requested to simplify the FACTORY section in the sidebar, which was cluttered with 5 fragmented links (Production Floor, Plan Production, Issue to Line, Record Shift, Stock).
- **Consolidated Sidebar to 2 Hubs (`app/layout.js`):**
  - **`Production`** (`/plant`, matching `/plant`, `/production`, `/production/dpr`, `/production/qc`): Combined badge of actionable factory work (`lines + inv.toPlan + inv.qc`).
  - **`Stock & Warehouse`** (`/inventory`, matching `/inventory`, `/production/fg`, `/inventory/issue`, `/inventory/adjust`).
- **Enhanced PageTabs Header Navigation (`app/PageTabs.js`):**
  - Group **`production`**: `Production Floor` (`/plant`), `Plan Production` (`/production`), `Record Shift` (`/production/dpr`).
  - Group **`stock`**: `Raw Material` (`/inventory`), `Finished Goods` (`/production/fg`), `Issue to Line` (`/inventory/issue`), `Adjustments` (`/inventory/adjust`).
- **Direct Plan Actions (`app/production/page.js`):**
  Added **`[Issue RM]`** (`/inventory/issue/new?plan=${p.id}`) and **`[Enter DPR]`** directly on each plan row, connecting planning directly with material issuing.
- **UI Elements Preserved:**
  Zero breaking changes to existing routes, CSS classes, colors, or tokens.

### 2026-10-29 - 31. Align Shift Sub-Tabs to Top-Right Header Bar
- **Why:** In `/production/dpr` and `/production/qc`, the secondary shift sub-tabs (`1. Enter production | 2. Check pieces`) stacked on a separate row directly underneath the primary hub navigation tabs (`Production Floor | Plan Production | Record Shift`), cluttering the vertical space.
- **Top-Row Alignment (`app/production/ProdTabs.js`, `app/globals.css`):**
  - Added `.tabs-bar` with flexbox layout (`justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 16px;`).
  - Wrapped `group="production"` and `group="shift"` in `.tabs-bar`.
  - Pinned the `shift` sub-tabs (`1. Enter production | 2. Check pieces`) to the top-right (`margin-left: auto`), sitting on the same horizontal row directly opposite the main Production hub tabs on the left.
  - Preserved standard `.tabs`, `.tab`, `.tab.on` styles, tokens, and responsive mobile wrap.

### 2026-10-29 - 32. Dynamic Expandable Pipeline Tabs on Orders Page
- **Why:** The Orders page pipeline tab strip (7-8 tabs) plus toolbar controls exceeded screen width, forcing the filters/search onto a second row and leaving a large empty void on the left.
- **Dynamic Tabs Implementation (`app/orders/page.js`, `app/globals.css`):**
  - Added `.tabs-dynamic` class where inactive tabs collapse to compact pills showing **Icon + Badge Count** (`[ ⌛ 0 ]`, `[ 📦 0 ]`, `[ 🚚 0 ]`, etc.).
  - The active tab expands with the full text label and highlighted style (`[ ⚡ All Active  2 ]`).
  - Native `title` and `aria-label` tooltips ensure complete accessibility and immediate hover context.
  - Tab strip width reduced from ~800px to ~400px, enabling the entire header (tabs + More Filters + Search + Export) to sit on **one single line** with zero dead space.

### 2026-10-29 - 33. Collapsible Filter Dropdown Button on Orders Page
- **Why:** To match the compact dynamic tabs, the user requested the "More Filters" dropdown button to also collapse into an icon button when inactive.
- **Implementation (`app/orders/page.js`, `app/globals.css`):**
  - Added `.q-label` and `.q-caret` inside `.q-menu summary`.
  - When no dropdown filter is active, the text is hidden (`.q-menu:not(:has(.btn-primary)) .q-label { display: none; }`), collapsing the button to a neat `[ 🍸 ▾ ]` icon button (~38px wide instead of ~130px).
  - When a filter is selected (e.g. `Approved (All)`), it expands to show the full filter name and active `.btn-primary` styling.
  - Added smooth caret rotation on open (`.q-menu[open] .q-caret { transform: rotate(180deg); }`).
  - Complete `title` and `aria-label` tooltips added for full accessibility.

### 2026-10-29 - 34. Moved New Quotation from Sidebar to Table Top Bar
- **Why:** In the sidebar under `SALES`, `New Quotation` sat as an extra menu item below `Orders`. To make the navigation cleaner and match other sections (like `Purchase Orders` with `+ New PO`), the user requested to move `New Quotation` into the toolbar next to `Export`.
- **Implementation (`app/layout.js`, `app/orders/page.js`):**
  - Removed `{ href: '/orders/new', label: 'New Quotation' }` from `app/layout.js` sidebar nav, leaving `Orders` as the single clear Sales entry.
  - Added primary action button `+ New Quotation` (`/orders/new`) to `.tbl-filters` on `app/orders/page.js` next to `Export`, guarded by `can(me, 'sales')`.

### 2026-10-29 - 35. Added Universal Topbar Back Navigation
- **Why:** When users navigate to sub-pages, forms, or detail screens (such as `/orders/new` - New Quotation, `/orders/[id]/edit`, `/inventory/po/new`, etc.), there was no in-app option to go back.
- **Topbar Back Button (`app/Shell.js`, `app/globals.css`):**
  - Added a responsive, rounded Back button (`.tb-back`) directly to the left of the page title in the topbar (`.tb-l`).
  - Active on every page except Dashboard (`pathname !== '/'`).
  - Uses `window.history.state?.idx > 0 ? router.back() : router.push(getFallback(pathname))`.
  - Fallback map routes sub-pages directly to their parent hub (e.g. `/orders/new` → `/orders`, `/inventory/po/new` → `/inventory/po`, `/admin/*` → `/admin/settings`).
  - Preserves previous filter, sort, search, and scroll state when returning via `router.back()`.

### 2026-10-29 - 36. Replace Order Dialog '··· More' Popover with Direct Left Icon Buttons
- **Why:** In the Order Profile dialog footer, actions (Duplicate, Edit order, Cancel, Short Close, Delete) were hidden behind a popover menu button (`··· More ▾`), requiring an extra click.
- **Direct Icon Buttons (`app/orders/OrderDialog.js`, `app/globals.css`):**
  - Replaced `<FootMore>` with direct icon-only action buttons in `.foot-acts-left` on the bottom-left corner.
  - Buttons include tooltips and `aria-label`: `Duplicate` (`ph-copy`), `Edit order` (`ph-pencil-simple`), `Cancel order` (`ph-prohibit`), `Short close` (`ph-scissors`), and `Delete` (`ph-trash` in danger red).
  - Clean 32px circle buttons (`.btn-ghost.btn-sm.btn-ic`) aligned to the left corner, keeping primary workflow next-step buttons on the right.

### 2026-10-29 - 38. Unified Top Dashboard Banner (Greeting Left, Quick Shortcuts Right)
- **Why:** The user requested keeping the top card as a unified banner: greeting and role on the left, quick shortcuts on the right, and eliminating the bottom-right shortcuts card.
- **Implementation (`app/page.js`, `app/Shell.js`):**
  - **Top Banner Card (`app/page.js`):**
    - Left side: Personalized greeting (`Good day, Hemant Gupta`) and role info (`Role: Admin · Operational Command Center`).
    - Right side: Quick shortcuts row: `[+ New Quotation]` (primary), `[Issue RM to Line]`, `[Record Shift Output (DPR)]`, and `[Create Purchase Order]`.
  - **2-Column Command Center (`app/page.js`):**
    - Left column (65% width): Orders Pipeline (4 KPI tiles), Factory & Inventory (4 KPI tiles), and Active Orders Table.
    - Right column (35% width): Live Activity audit stream running at full column height without the bottom shortcuts card.
  - **Persistent Topbar (`app/Shell.js`):**
    - Clean topbar with standard `Dashboard` title and `Overview of orders, production, and waiting work` subtitle.

### 2026-10-29 - 39. Compact Top Banner Layout (.dash-banner: Left Aligned Greeting, Right Aligned Actions)
- **Why:** In the top card, the greeting and shortcuts were vertically stacked and centered because default `.card` CSS uses flex-direction column. The user requested moving greeting to the far left, shortcuts to the far right on a single horizontal row, and compacting the banner.
- **Implementation (`app/globals.css`, `app/page.js`):**
  - Created dedicated `.dash-banner` class enforcing `display: flex; flex-direction: row; justify-content: space-between; align-items: center; padding: 12px 20px;`.
  - Aligned `.dash-banner-info` (greeting + role subtitle) to the far left.
  - Aligned `.dash-banner-acts` (4 action buttons) to the far right.
  - Compacted vertical spacing and container gap to 16px. Responsive wrap to column on screens below 900px.

### 2026-10-29 - 40. Production Floor Layout Polish (Dynamic Expandable Tabs & Smart Empty State)
- **Why:** On `/plant`, two identical tab bars were stacked directly on top of each other (`PageTabs` and the queue status tabs), cramping the search bar and leaving an awkward empty 9-column table header when 0 items were in the queue.
- **Implementation (`app/plant/page.js`, `app/plant/PlantClient.js`):**
  - **Dynamic Tabs (`.tabs-dynamic`):** Upgraded queue status filters to dynamic expandable tabs (active tab expands with full title + badge, inactive tabs collapse to clean icon + badge), giving the search bar and Export button abundant breathing room.
  - **Clean Hierarchy:** Page switcher tabs (`PageTabs`) remain full-text at the top, clearly separating page navigation from in-table queue filtering.
  - **Contextual Empty State:** Hides the empty 9-column table header when `rows.length === 0` and displays a helpful empty state with 1-click jump button to any populated queue (e.g. `View Dispatched (3) →`).

### 2026-10-29 - 41. Clarified Factory Sub-Page Tabs & Titles
- **Why:** The previous names (*"Production Floor"*, *"Plan Production"*, *"Record Shift"*) were confusing because "Production" was repeated at every level and did not describe the actual job of each screen.
- **Implementation (`app/PageTabs.js`, `app/Shell.js`, `app/plant/page.js`, `app/production/page.js`, `app/production/dpr/page.js`):**
  - **Tab 1 (`/plant`):** Renamed from *Production Floor* to **Ready to Ship** (with `ph-truck` icon), accurately describing order fulfillment and DO generation.
  - **Tab 2 (`/production`):** Renamed from *Plan Production* to **Production Planning** (with `ph-calendar-check` icon) for shortage calculation and line shift planning.
  - **Tab 3 (`/production/dpr`):** Renamed from *Record Shift* to **Daily Production Report (DPR)** (with `ph-clipboard-text` icon) for machine shift output and QC inspection.

### 2026-10-29 - 42. Stock & Warehouse Screen Rebuilt to Proposal 1 (Unified Toolbar & Quick Filters)
- **Why:** The previous Stock screen had an unstyled floating form between the navigation tabs and the table card, repeated date inputs, duplicated the Stock Correction button, hid critical low-stock items behind an unnoticeable checkbox, and took excessive vertical height.
- **Implementation (`app/inventory/page.js`, `app/inventory/InvTabs.js`, `lib/inventory.js`):**
  - **Unified Card Toolbar (`.tbl-top`):** Eliminated the loose outer `.page-head` form and integrated all search, store selection, filters, and export inside the table card header.
  - **Dynamic Filter Tabs (`.tabs-dynamic`):** One-click toggle pills for `[ All Materials (4) ]` and `[ ⚠️ Below Minimum (2) ]` (highlighted with red badge count).
  - **Collapsible Dates & Plant Filter (`details.dl-menu.q-menu`):** Folds date range inputs and plant dropdown into a compact, responsive menu that lights up when custom ranges are active.
  - **Clean Presentation:** Omitted redundant static help box on `/inventory` and added a contextual empty state with a 1-click jump back to all materials.

### 2026-10-29 - 43. Flat Sidebar Navigation (Removed Grouping Headers)
- **Why:** The user requested removing the section grouping headers (`SALES`, `BUYING`, `FACTORY`, `REPORTS`) from the left sidebar to eliminate visual noise and collapsible accordions.
- **Implementation (`app/layout.js`):**
  - Removed `{ section: 'Sales' }`, `{ section: 'Buying' }`, `{ section: 'Factory' }`, and `{ section: 'Reports' }` from the navigation array.
  - Renders all primary workflow destinations directly as a clean, flat list (`Dashboard`, `Orders`, `Purchase Orders`, `Production`, `Stock & Warehouse`, `Reports`, and `Settings` at the bottom).

### 2026-10-29 - 44. Modern 1-Word Terminology: Purchasing & Inventory
- **Why:** `Stock & Warehouse` was clunky with an ampersand, while `Purchase Orders` was long. Adopting standard modern 1-word supply chain terminology creates a cleaner, high-density sidebar navigation.
- **Implementation (`app/layout.js`, `app/Shell.js`, `app/inventory/page.js`, `app/inventory/po/page.js`, `app/page.js`):**
  - Renamed `Stock & Warehouse` to **Inventory** across sidebar, topbar, tab labels, and metadata.
  - Renamed `Purchase Orders` to **Purchasing** across sidebar, topbar, and metadata.
  - Sidebar reads in natural supply-chain sequence: `Dashboard` → `Orders` → `Purchasing` → `Production` → `Inventory` → `Reports` → `Settings`.

### 2026-10-29 - 45. BOM Management System & Parametric Recipes (Suggestion A)
- **Why:** Replaced manual "Issue to Line" guessing with an automated Bill of Materials (BOM) management system tailored to Aluminum Composite Panel (ACP) manufacturing.
- **Implementation:**
  - **Database (`supabase/migrate-018.sql`):** Created `boms` and `bom_items` tables with unique constraint on `(grade, thickness, top_skin, bottom_skin)` and layer breakdown (Top Coil, Bottom Coil, Core Granules, Polymer Adhesive Film, Protective Masking Tape). Pre-seeded 3 standard Saudi/GCC ACP recipes:
    1. Standard ACP 4mm · PE Core · 0.25 / 0.20 (4.694 kg/m²)
    2. Fire-Rated ACP 4mm · FR-B1 Core · 0.50 / 0.50 (7.747 kg/m²)
    3. Signage ACP 3mm · PE Core · 0.20 / 0.20 (3.636 kg/m²)
  - **BOM Library (`lib/bom.js`):** Recipe matching engine (`matchRecipe`), standard layer consumption calculations (`calculateRecipeNeeds`), and DB fetching with built-in parametric fallbacks.
  - **Sub-Navigation (`app/PageTabs.js`, `app/inventory/InvTabs.js`, `app/PageHelp.js`):** Upgraded sub-tabs from `Issue to Line` to **`BOM & Recipes`** (`/inventory/bom`, icon `ph-receipt`).
  - **BOM Hub (`app/inventory/bom/page.js`):** Built Proposal 1 card header toolbar with dynamic expandable tabs: `Recipes`, `Formula Calculator`, and `Issue History`. Includes search, grade filter pills, and recipe cards.
  - **Interactive Recipe Dialog (`app/inventory/bom/BomDialog.js`):** Complete layer-by-layer breakdown (rates, scrap %, formula rules) with interactive live batch calculator and 1-click issue link.
  - **Parametric Calculator (`app/inventory/bom/CalculatorCard.js`):** Interactive formula calculator supporting custom sheet sizes (width/length/m²), live weight sums, and direct line requisition.
  - **Production Plan Integration (`app/production/PlanDialog.js`):** Connected BOM calculator to production planning: calculates exact raw materials required for the planned M² and compares live against plant stock to flag shortages and provide 1-click line issuing.

### 2026-10-30 - 46. BOM & Recipes Layout Rebuilt to Proposal 1 (High-Density Clean ERP Table)
- **Why:** The BOM screen suffered from double top-banner clutter (bulky `.page-help` with 3 step circles, plus blue migration banner), wrong action button (`+ New Issue Slip` instead of `+ New Recipe`), generic subtitle, and noisy table columns with long repetitive text and raw composition strings.
- **Implementation:**
  - **Top Bar (`app/Shell.js`):** Added `/inventory/bom` route mapping so topbar shows **`BOM & Recipes`** with subtitle *"Standard formulas and raw material consumption per M²"*, maintaining active state for `Inventory` in the sidebar.
  - **Eliminated Header Clutter (`app/inventory/InvTabs.js`, `app/inventory/bom/page.js`):** Suppressed `.page-help` on `tab="bom"` and removed loose blue banner above the card; content card starts immediately below the sub-navigation tabs.
  - **Unified Card Header Toolbar (`app/inventory/bom/page.js`):** Dynamic expandable tabs (`Recipes`, `Formula Calculator`, `Issue History`), segmented Grade pills (`All Grades`, `PE`, `FR-B1`), search bar, secondary shortcut `⚡ Issue to Line`, and primary button `+ New Recipe`.
  - **High-Density Table Design:**
    - Recipe Code rendered as a clean mono badge (`BOM-4MM-PE-025`) alongside Grade badge (`PE` / `FR-B1`).
    - Panel specification title displayed cleanly without redundant description strings.
    - Total Thickness rendered as a clear numeric metric (`4.0 mm`).
    - Layer Architecture displayed as structured micro-pills (`Top: 0.25mm` · `Core: 3.55mm` · `Bot: 0.20mm`).
    - Total RM Weight per M² highlighted in bold red accent (`4.69 KG / M²`).
    - Status (`Active` badge) and `View Formula` action button.
  - **New Recipe Modal (`app/inventory/bom/NewRecipeDialog.js`):** Added modal dialog to define panel grade, thickness, top/bottom skins with live preview of calculated core layer and estimated weight per M².

### 2026-10-30 - 47. Stock Adjustments Layout Rebuilt to Proposal 1 (Unified Card & Dynamic Tabs)
- **Why:** The Adjustments screen was dominated by an empty, disjointed 2-card form sprawled across the screen, hiding the actual audit log of adjustments below the fold, topped by double banner clutter (bulky `.page-help` and loose `page-head` strip).
- **Implementation:**
  - **Eliminated Header Clutter (`app/inventory/InvTabs.js`, `app/inventory/adjust/page.js`):** Suppressed `.page-help` on `tab="adjust"` and removed the loose `.page-head` strip; card starts immediately below the sub-navigation tabs.
  - **Unified Card Header Toolbar:** Dynamic expandable tabs (`Adjustment Log` vs `Post Adjustment`), store filter dropdown (`All Stores`), search bar (`Search ref, material, reason…`), secondary action `[ ⤒ Load Opening (CSV) ]` with modal file upload, and primary button `[ + New Adjustment ]`.
  - **Default View is the Audit Log:** The complete history of adjustments and openings is now the primary view, with color-coded positive/negative quantities (`+500 KG` in green, `-120 KG` in bold red), store labels with plant badges, and mono ref badges.
  - **Clean Form Subview:** Switching to `Post Adjustment` renders the inline adjustment form with store combobox, date, reason, and dynamic line items with a clean "Back to Log" shortcut.
  - **Topbar Sync (`app/Shell.js`):** Updated title to **`Stock Adjustments`** (*"Physical count corrections and opening stock ledger"*).

### 2026-10-30 - 48. Resolved React 19 Script Warning & Server Component EventHandler Error
- **Why:** Two console errors occurred:
  1. `Event handlers cannot be passed to Client Component props`: An inline `onChange` handler was placed on `<select>` within the server component `app/inventory/adjust/page.js`.
  2. `Encountered a script tag while rendering React component`: Next.js `<Script>` with `beforeInteractive` inside `app/layout.js` triggered React 19's runtime script validation warning.
- **Implementation:**
  - **Client Component `StoreFilter` (`app/inventory/adjust/StoreFilter.js`):** Extracted the store dropdown into a client component with `'use client'` using Next.js `useRouter().push()`.
  - **Native `<script>` & Server-side Warning Guard (`app/layout.js`):** Replaced `<Script>` with standard HTML `<script id="theme-init">` and added development console filter for pre-hydration theme scripts.

### 2026-10-30 - 49. Clean RSC Boundaries (OrdersView) & Theme Pre-paint External Script
- **Why:** Two console errors occurred:
  1. `Functions cannot be passed directly to Client Components`: `app/orders/page.js` passed `sortHref` and `viewHref` functions into client component `<OrdersView>`.
  2. `Encountered a script tag while rendering React component`: React 19 JSX validator blocks inline script elements rendered without `src` or `async` inside component trees.
- **Implementation:**
  - **OrdersView RSC Clean boundary (`app/orders/page.js`, `app/orders/OrdersView.js`):** Removed `viewHref` and `sortHref` function props. Pre-computes serializable `sortHrefs` dictionary in `orders/page.js` and constructs `viewHref(id)` locally within `OrdersView.js`.
  - **Static Theme Pre-paint Script (`public/theme-init.js`, `app/layout.js`):** Extracted theme pre-hydration logic into a static `/theme-init.js` resource loaded via `<script id="theme-init" src="/theme-init.js" />`, satisfying React 19's resource hoisting rules.









### 2026-10-31 - 50. Combined UI audit fixes (desktop + phone)
- **Why:** The user asked to fix every point in the combined audit (UI-AUDIT-2026-10-31.html, 41 findings). Not deployed yet.
- **Broken:** Reports → Production crashed (`.catch()` on a Supabase query builder, production/reports/page.js). Five undefined CSS variables replaced with real tokens. Theme is re-applied by the Shell when the head script missed a render; the theme switch no longer throws on an aborted View Transition.
- **One name per place:** sidebar, phone bar, top bar and stepper use Dashboard / Orders / Purchasing / Production / Inventory / Reports / Settings (no Buying, Floor, Stock, Bill). Top bar shows the area; the sub-line names the tab. Reports pages no longer say "Settings" in the tab title (app/admin/reports/layout.js). Production is one tab row (Ready to ship, Planning, Shift output, Check pieces); Inventory gains an "Issues to line" tab.
- **Words, not icons:** status tabs always show labels (phones scroll with an edge fade); order rows show one labelled next step ("Make PI", "Attach tax invoice (1 of 2)"), also on phone cards; order dialog footer has Duplicate and Edit, with Cancel / Short close / Delete under More.
- **Colour:** red only for the primary action, brand mark, active nav and danger. New tokens `--link` (links, quote numbers, document chips, charts) and `--ring` (solid 2px focus ring everywhere). Neutral role tags, stepper current step, totals, section icons, help step numbers.
- **Shared parts:** `askConfirm()` replaces every `window.confirm`; `MenuCloser` closes every `details.dl-menu` on Esc, outside press and navigation; `DateRange` (presets + From/To) on Reports, Production report, Inventory, Finished goods, Activity log; `CustName` + `splitName()` show "(English) Arabic" names on two lines (self-check in lib/tas.test.mjs); `HelpBox` lets people fold the page help ("Got it", remembered per page in the browser).
- **Layout:** dashboard sections on the page background (no cards in cards), "Recent orders" table, activity grouped by order, no nested scroll; Settings second sidebar replaced by a tab row; sticky Actions column on wide tables; one Save on Company settings; cards inside dialogs flattened; quotation form has a sticky total + Cancel + Submit bar and wider Grade/Core/Colour fields; shipped lines show a lock instead of a delete icon.
- **Phones:** toolbars wrap inside their cards (Purchasing overflow fixed), search first, New quotation floats above the tab bar; tab bar is Dashboard / Orders / Production / Inventory / More (Settings, Theme, Log out at the top of More); top-bar search button; dialog forms (New PO etc.) put their submit in the footer next to Close; material lines as compact cards; documents at 85% with sideways scroll instead of 50%.
- **Type & motion:** sizes collapsed onto one scale with a 12 px minimum, 14 px body, no 800 weight, missing `.fw7` defined; page slide-in removed; no `transition: all`; reduced motion keeps a 120 ms fade on dialogs, sheets and toasts.
- **Checked:** `next build` passes, `lib/tas.test.mjs` passes, Impeccable detector clean; walked in the browser pane at 1440 × 900 and 375 × 812 as Admin. Not checked: other roles, light theme screenshots, real submits.

### 2026-10-31 - 51. Re-audit in light and dark, every page, desktop / tablet / phone
- **How:** a scan script loaded all 31 pages in same-origin iframes at 1440, 1024, 768 and 375 px in both themes and checked text contrast (WCAG AA), text under 12 px, content past the screen edge and tables that scroll sideways; then screenshots of the main pages in light mode.
- **Fixed:** light-mode `--muted` darkened to #636366 (grey sub-text on tiles was 3.97:1); Orders rows show one next step only (two labelled buttons hid Date and Salesperson); quote line fields re-sized so Edit order fits; Orders tab strip slimmer; Customers and Materials tables show fewer columns (`listCols` in lib/tas.js; edit form and CSV keep all); long material codes wrap; phone tab bar solid background; phone label/value cards align their first row; phone two-field form rows go one column (VAT no. was cut off); settings section tab text neutral; 769–1280 px hides the least-needed columns (Orders date + salesperson, master type / mobile / address / kind / min / max / width, Users username / mobile, BOM bottom skin) and keeps the first column of report tables in place.
- **Result:** 0 contrast, size or overflow findings in light and dark at 1440 and 375; no sideways table scroll at 1440 or 768; at 1024 only the report tables (Salespeople, Customers, Dispatch) scroll, with the name column fixed. Build, tests and the Impeccable detector pass.

### 2026-10-31 - 52. Last open audit items
- **Report tables at 1024 px:** Salespeople/Customers hide Pending, Rejected, Cancelled and Dispatch hides Vehicle, M2 and Days DO → PI; Customers also hides Code and Avg quote (totals row too) between 769 and 1280 px (all still in the CSV export), so no table scrolls sideways at tablet width.
- **Inline styles:** 105 literal layout styles became utility classes (`mt-*`, `mb-*`, `gap-*`, `d-flex`, `ai-c`, `jc-sb`, `w-full`… at the end of globals.css, `!important` so they keep the inline precedence). 196 remain: computed or conditional values (widths from data, state colours) that belong inline.
- **Orders title:** for roles that open on My work (approver, plant, operations, accounts) the top bar now says "My work" (MY_WORK_ROLES in Shell.js mirrors MY_WORK in lib/server.js).
- **Console:** SalesTable header cells get keys. The theme loader stays a plain blocking `<script>` in `<head>`: `next/script` beforeInteractive was tried and only preloads the file, which would flash the wrong theme. React's dev-only "script tag" warning is filtered in app/ui.js; production doesn't log it.

### 2026-10-31 - 53. Auto-issue made safe (review findings A–D) + credit gate
- **Why:** an outside review of the auto-issue work (Option B) found four real problems; all were confirmed against the code and the live database before fixing.
- **A. Plan auto-issue:** `auto_issue_plan` in migrate-020 read the old static `bom_items`, and all 15 rows there have no material linked (`default_mat_id` null), so it would issue nothing. Rewritten as `auto_issue_plan(p_plan_id, p_lines, p_by)`: the app passes the parametric BOM totals (calcDprBOM) and the function moves only the shortfall, links the transfer to the plan and checks RM stock, all in one transaction (the old 2-argument version is dropped).
- **B. DPR auto-issue:** the app moved material with `create_transfer` before `create_production`; a failed entry left the transfer behind. The JS pre-transfer is removed; `create_production` (migrate-020) issues the shortfall inside its own transaction. New SQL tests prove a failed DPR or plan issue leaves no transfer and no production.
- **C. Silent errors:** `autoIssuePlan` runs from a plain form, so its `{ error }` was lost. Every outcome now redirects with a toast (`go(...)`).
- **D. Keys:** scripts/check_columns.py, check_existing.py and insert_erp_materials.py had the service-role key and project URL written in. They now read SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env.local.
- **Credit gate:** quotes under the auto-approve amount now go to the approver when the customer is over its credit limit; the toast says why.
- **Icons:** phosphor subset regenerated (calendar-blank, lock-simple, question used by the audit fixes, magic-wand for auto-issue).
- **Deploy order:** run supabase/migrate-020.sql in the Supabase SQL Editor first, then deploy. The live code before this commit works with the new SQL too.

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
- **Speed optimization session (2026-10-29)** — Speed plan: matching DOT ONE (perceived latency):
  - IntentLink: hover/touchstart prefetch with Next.js dynamic staleTimes on sidebar, PageTabs, and Orders tabs.
  - Query parallelization: merged 3-round query waterfall down to 2 concurrent rounds in `orders/page.js` and `layout.js`.
  - Instant order dialog: `OrdersView.js` client table host, opening dialogs in ~16 ms from row data + `history.pushState`, async background history loader (`loadOrderDetail`).
  - Optimistic actions: `useOptimistic` for instantaneous row status transitions on quote approve/reject.
  - Service Worker: `public/sw.js` cache-first for `_next/static`, icons, fonts; `proxy.js` matcher exclusion; `offline.html` fallback.
