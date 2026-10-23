 # TAS OMS — Quotation → Approval → Delivery Order → Plant Dispatch → Proforma Invoice

Next.js 16 + Supabase rewrite of the "FMS- OMS SAUDI" Google Sheet / Apps Script workflow.
The emailed one-click approval link is gone: users with the **approver** role approve or reject inside the app.

## Workflow and roles

| Step | Who | Where |
|---|---|---|
| Create quotation (customer, salesperson, line items, transport, VAT 15%) | sales, admin | New Quotation |
| Approve / reject (reason required) | approver, admin | Active Orders → row Actions (or open the order) |
| Cancel (reason required, only before a Delivery Order) | approver, admin | order dialog |
| Generate Delivery Order / DO (after approval; DO qty per line ≤ ordered, 0 leaves a line out) | operations, admin | Active Orders → row Actions |
| Plant status per DO line (Pending / Under Production / Coil N/A + coil date) | plant, admin | Plant Dispatch, or the order dialog |
| Dispatch DO lines (part quantities allowed; date, vehicle, transporter, LR no, driver) | plant, admin | Plant Dispatch → Dispatch, or Active Orders → row Actions |
| Undo a dispatch entered by mistake | plant, admin | order dialog → Dispatch History |
| Short close (reason required; the rest of the DO will not ship) | plant, approver, admin | order dialog |
| Generate Proforma Invoice / PI (after the DO; qty ≤ ordered; changed prices need a reason) | accounts, admin | Active Orders → row Actions |
| Duplicate a quotation (e.g. to resubmit a rejected one) | sales, admin | order dialog |
| Upload tax invoice (PDF/image, max 4 MB) | accounts, admin | Active Orders → row Actions |
| Customers, Items, Users | admin | top menu |

Flow: Quotation → Approval → DO → plant dispatch (Pending → Partially → Fully Dispatched), with PI → tax invoice
running alongside the dispatch. The dispatch status shows next to the order status in All Orders, Active Orders and
the order dialog; an order stays in Active Orders until it is dispatched (or short closed), invoiced and its tax
invoice is uploaded. Every step is written to the order's **Timeline**. Rules carried over from the sheet: DO / PI only for APPROVED orders, one of each per order, and they share one
number `CUSTCODE-DD/MM/YY-NN` (whichever is generated first assigns it). Quotes are `Q-YYYY-NNN`.
Sales users only see their own orders. Documents open as printable pages in the TAS format — use
**Print → Save as PDF**.

## Setup

1. **Database** — existing database from an earlier version? Run whichever of `supabase/migrate-001.sql`,
   `migrate-002.sql`, `migrate-003.sql` you have not run yet, in that order, and skip the rest of this step. Otherwise, in Supabase → SQL Editor, run `supabase/schema.sql`, then `supabase/seed.sql`
   (118 customers from `Ref files/Supplier List.xlsx` with codes CUS-001…, 3,800 items from
   `RM-Finish Goods SKU.xlsx`). Fix customer codes / CR / mobile under **Customers** if the live sheet differs.
2. **First admin** — Supabase → Authentication → Users → *Add user* (tick auto-confirm), then in SQL Editor:
   ```sql
   insert into profiles (id, full_name, email, role)
   select id, 'Admin', email, 'admin' from auth.users where email = 'you@example.com';
   ```
   Also turn off *Allow new users to sign up* (Authentication → Sign In / Providers): only the admin creates users.
3. **Keys** — copy `.env.example` to `.env.local` and fill in the three values from Project Settings → API.
4. **Run**
   ```bash
   npm install
   npm run dev
   ```
   Open http://localhost:3000 and sign in. `npm test` checks the quotation maths.

## Deploy to Vercel

Push this folder to a GitHub repo, import it in Vercel, add the same three environment variables, deploy.

## Layout

- `supabase/` — schema (tables, numbering functions, private `tax-invoices` bucket), seed and its generator
- `lib/tas.js` — company details, roles, M2 / totals / VAT maths (shared by browser and server)
- `lib/server.js` — Supabase clients, `requireRole`, `getOrder`
- `app/orders/actions.js` — create quote, approve/reject, DO, plant status, dispatch / undo / short close, PI, cancel, tax invoice upload
- `app/plant/page.js` — Plant Dispatch: DO lines grouped by DO, tabs Open / Pending / Partial / Dispatched
- `app/orders/DispatchModal.js` — the dispatch dialog (one line, or every open line of a DO)
- `app/orders/[id]/print/[doc]/Doc.js` — Quotation / Delivery Order / Proforma Invoice layouts
- `app/admin/` — users and master data screens
- `app/globals.css` — design system copied from the GAS FMS `Stylesheet.html` (red instead of indigo); `app/Shell.js` sidebar/topbar/toasts; `app/ui.js` dialogs, status pills, file drop

All database access runs on the server with the service-role key; every table has RLS switched on with no
policies, so the public keys cannot read anything directly.

## Tax invoices in Google Drive

Uploads go to the Drive folder in `GOOGLE_DRIVE_FOLDER_ID`, named `<quote no> - <PI no> - <file name>`; the app
streams them back at `/orders/<id>/tax-invoice`. Invoices uploaded before the switch stay in the Supabase
`tax-invoices` bucket and still open. One-time setup in Google Cloud Console (same project for both options):

1. Create a project and enable the **Google Drive API**.
2. Pick one way to sign in, then put the values in `.env.local` and in Vercel → Settings → Environment Variables:
   - **Google Workspace:** create a service account → Keys → Add key (JSON). Put the folder in a **Shared Drive**
     and add the service account's email to that Shared Drive as *Content manager*. Paste the whole JSON key, on
     one line, into `GOOGLE_SERVICE_ACCOUNT_JSON`. (A service account cannot upload into a normal My Drive folder.)
   - **Personal Gmail:** OAuth consent screen (External, add yourself as test user, then *Publish* so the token
     doesn't expire after 7 days) → Credentials → OAuth client ID (Web app) with redirect URI
     `https://developers.google.com/oauthplayground`. In the OAuth Playground, tick *Use your own OAuth
     credentials*, authorize scope `https://www.googleapis.com/auth/drive` as the folder's owner, exchange the code
     and copy the refresh token. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`.
3. Restart `npm run dev` / redeploy.
