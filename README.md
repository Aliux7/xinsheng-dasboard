# Xinsheng

Business system for a tarpaulin factory: raw-material warehouse, loom cloth production, purchasing, sales, tax, accounting, costing and an owner dashboard. It replaces the Excel workbooks the factory used until September 2026 (warehouse) / December 2025 (accounting).

- **UI language:** Indonesian (Bahasa Indonesia). Code, comments and database field names are English.
- **No backend:** a Next.js web app that talks to Firebase (Authentication + Firestore) directly from the browser. Security is enforced by `firestore.rules`.

---

## Contents

1. [Tech stack](#tech-stack)
2. [Getting started](#getting-started)
3. [First-time setup](#first-time-setup)
4. [Modules and pages](#modules-and-pages)
5. [How it works](#how-it-works)
6. [Accounts used](#accounts-used)
7. [Project structure](#project-structure)
8. [Adding a feature](#adding-a-feature)
9. [Known limitations and decisions](#known-limitations-and-decisions)

---

## Tech stack

| Area | Choice |
|---|---|
| Framework | Next.js 16 (App Router, `cacheComponents` on) with React 19 |
| Language | TypeScript |
| Styling | Tailwind CSS v4 + shadcn/ui (base-ui flavour), font Geist; logo font Aktura |
| Data | Firebase Authentication (email + password) and Cloud Firestore, client SDK only |
| Excel | `read-excel-file` (imports), `write-excel-file` (exports) |

> Next.js 16 differs from older versions. Read the guides in `node_modules/next/dist/docs/` before changing framework-level code (see `AGENTS.md`).

---

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in the Firebase web config
npm run dev                   # http://localhost:3000
```

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build (also type-checks) |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint |

### Environment variables (`.env.local`)

Firebase console → Project settings → General → Your apps → Web app config:

```
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
```

These web keys are public by design; access is controlled by `firestore.rules`. There are no server-side secrets.

---

## First-time setup

Do these once, in this order.

### 1. Firebase

1. Enable **Authentication → Sign-in method → Email/Password**.
2. Create the **Firestore database**.
3. Publish **`firestore.rules`** (Firestore → Rules). Without them, locks, approvals and "never edited" protections are not enforced.
4. Create the users in **Authentication → Users** (there is no sign-up page).

### 2. Roles

Each user has `users/{uid}.role`:

| Role | Can do |
|---|---|
| `developer` | Everything; can change Master, Admin and Staff. Nobody can change a Developer |
| `master` | Everything; can change Admin and Staff |
| `admin` | Approve stock-count differences, large payments and weighing differences; close and reopen periods; run imports |
| *(empty)* — Staff | All normal pages |

The **first Developer** must be set by hand: Firestore → `users` → your document (your UID) → add field `role` = `developer`. After that, roles are managed from **Admin → Pengguna**.

### 3. Master data (Data Master pages, "Impor Excel" buttons)

| Page | Source |
|---|---|
| Departemen | "Tambah Extruder & Laminasi" button |
| Pemasok | `Laporan Bahan Baku-September.xlsx`, sheet SUPPLIER |
| Bahan baku gudang | same file, sheet KODE |
| Item penjualan | `TYPE TERPAL DAN BAHAN BAKU.xlsx`, sheet TERPAL |
| Item pembelian | same file, sheet BAHAN |
| Tipe kain & mesin loom | `Laporan Kain Loom-September.xlsx`, sheet DATA |
| Baris laporan | **Impor baris laporan** template (sheet BARIS LAPORAN: kode, nama, awalan nomor akun) |
| Daftar akun | **Impor akun** template (sheet AKUN: same columns as the account form); unknown report-line codes are created automatically |

### 4. History imports (Admin → Impor data)

One page with four tabs, run in order. Each runs **once**, shows a preview before saving, and resumes if interrupted.

| # | Tab | File | Result |
|---|---|---|---|
| 1 | Riwayat gudang | `Laporan Bahan Baku-September.xlsx` | Weighings, washing/recycle output, usage May–Sep 2026; stock movements; months closed; counters set. The warehouse must be empty first. |
| 2 | Roll loom | `Laporan Kain Loom-September.xlsx` | 420 cloth rolls; new rolls continue at 421 |
| 3 | Jurnal 2025 | `FINANCIAL STATEMENT 2025 (PT) Combine.xlsx` | 186 journal entries; Sep–Dec 2025 closed |
| 4 | Faktur pembelian 2025 | same file (sheet AP) | 7 purchase invoices linked to the imported journal; open total = trade payable ledger |

### 5. Before using costing

Map materials in **Biaya & produksi → Pemetaan kode bahan** (warehouse BB codes ↔ purchase IA codes), confirmed with the factory.

---

## Modules and pages

45 pages in 11 sidebar sections (plus Login).

| Section | Page | Route | Purpose |
|---|---|---|---|
| Ringkasan | Dasboard | `/` | Owner dashboard: stock, cloth, cash & bank, payables due, receivables overdue, month sales & profit, approvals waiting |
| Data Master | Pemasok | `/suppliers` | Suppliers (code, terms) |
| | Item pembelian | `/purchase-items` | Purchase catalogue (IA codes, booking account) |
| | Bahan baku gudang | `/materials` | Warehouse materials (BB codes, condition, dirty → clean pair, min stock) |
| | Departemen | `/departments` | Departments (Extruder, Laminasi, …) |
| | Tipe kain & mesin loom | `/looms` | Cloth grades (g/m² standard) and loom machines |
| | Item penjualan | `/products` | Products (type, size, colour, net kg, price) |
| | Pelanggan | `/customers` | Customers (terms, credit limit) |
| Gudang | Timbangan masuk | `/weighings` | Truck weighing in/out; net added to stock |
| | Cuci & recycle | `/processings` | Washing / recycling; shrinkage |
| | Pemakaian bahan | `/usage` | Material used by department and shift |
| | Stok sekarang | `/stock` | Live stock by department |
| | Kartu stok | `/stock-card` | Stock card per material; Excel export |
| | Stok opname | `/stock-counts` | Stock count; large differences need Admin approval |
| Kain loom | Panen roll | `/rolls` | New cloth roll; g/m² vs grade standard |
| | Stok kain loom | `/cloth-stock` | Rolls in stock; issue to lamination |
| | Laporan loom bulanan | `/loom-report` | Monthly loom report; close month |
| Biaya & produksi | Pemetaan kode bahan | `/material-mapping` | BB ↔ IA mapping |
| | Pencocokan timbangan | `/matching` | Weighings not invoiced; invoice kg differences |
| | Nilai persediaan | `/inventory-value` | Average-cost inventory value; material-used posting |
| | HPP bulanan | `/hpp` | Monthly cost of production (COGS sheet layout) |
| | Barang jadi | `/finished-goods` | Finished-goods production and stock |
| Laporan | Neraca | `/balance-sheet` | Balance sheet per month-end |
| | Laba rugi | `/profit-loss` | Profit & loss per month |
| | Laporan stok bulanan | `/stock-report` | Monthly stock report; Tutup buku (warehouse) |
| | Rekap pemakaian harian | `/usage-summary` | Daily usage grid |
| Pembelian | Faktur pembelian | `/purchase-invoices` | Purchase invoice + journal; weighing matching |
| | Pembelian impor | `/import-purchases` | Import (PIB) + journal |
| | Pembayaran utang | `/supplier-payments` | Supplier payments; approval above the limit |
| | Umur utang | `/payables-aging` | Payables aging, checked against the ledger |
| Penjualan | Faktur penjualan | `/sales-invoices` | Sales invoice + journal; credit-limit warning |
| | Penerimaan piutang | `/customer-receipts` | Customer receipts |
| | Umur piutang & penjualan | `/receivables` | Receivables aging and sales list (tabs) |
| Pajak | Rekap PPN bulanan | `/vat` | Monthly VAT summary; mark reported |
| | Daftar PPh dipotong | `/withholding` | Withholding tax list; mark paid |
| Akuntansi | Daftar akun | `/accounts` | Chart of accounts |
| | Baris laporan | `/report-lines` | Balance-sheet / P&L lines (NR.., LR..) |
| | Jurnal umum | `/journal` | General journal; reversal entries |
| | Buku bank | `/bank` | Bank books, quick entry, transfers, reconciliation |
| | Buku besar | `/ledger` | General ledger per account |
| | Neraca saldo | `/trial-balance` | Trial balance |
| | Tutup periode akuntansi | `/accounting-periods` | Close / reopen accounting months |
| Admin | Pengguna | `/users` | Users and roles |
| | Riwayat perubahan | `/logs` | Every change, who and when |
| | Impor data | `/imports` | The four one-time history imports |

---

## How it works

The rules below are the essentials; `AGENTS.md` has the full list for developers.

- **Every write is logged.** All writes go through `lib/db.ts` (`addRecord`, `updateRecord`, `transaction`). Each change is stored with its before/after values in `logs`, shown on **Riwayat perubahan**.
- **All-or-nothing saves.** A document and everything it affects (stock, journal, counters) are saved in one Firestore transaction.
- **Document numbers** follow the company format: `PREFIX/YY` + month letter (A = Jan … L = Dec) + 5 digits, e.g. `TM/26J00001`. Bank vouchers use `BBM.26.10.0001` / `BBK.…` per bank; manual journals use `JV-0001/X/26`.
- **Stock** changes only through stock movements (`lib/stock.ts`), never typed in, and never below zero.
- **Money** moves only through balanced journal entries (`lib/journal.ts`). Saved entries are never edited; mistakes are fixed with a reversal entry.
- **Locks:** warehouse months (`periods`), loom months (`loomPeriods`), accounting months (`accountingPeriods`) and reported VAT months (`vatPeriods`) each lock the documents dated in them.
- **Approvals:** stock-count differences above 1% / 500 kg, supplier payments above Rp 100.000.000, and invoice-vs-weighing differences above 0,5% wait for an Admin.
- **Financial statements** read the ledger. Each account's report line (NR.. / LR..) decides which balance-sheet or P&L line it adds to.
- **Costing** is a monthly weighted average. Deliveries are valued from their matched purchase invoice; washing output takes the full cost of its input; material used is posted at warehouse month close.

---

## Accounts used

| Purpose | Account |
|---|---|
| Bank BCA 1 PT / BCA 2 (Nining Rahayu) / BCA 3 | 101201 / 101202 / 101203 |
| Trade receivable IDR / USD | 103101 / 103102 |
| Raw material / WIP / finished goods | 105101 / 105201 / 105301 |
| VAT in / PPh 22 prepaid (import) | 107001 / 107005 |
| Trade payable IDR / USD | 211101 / 211102 |
| PPh 23 payable / PPh 4(2) payable / VAT out | 214003 / 214005 / 214001 |
| Local sales | 401001 |
| Cost of goods sold | 510101 |

Defined in `lib/collections.ts` (`BANKS`, `PURCHASE_ACCOUNTS`, `SALES_ACCOUNTS`, `INVENTORY_ACCOUNTS`).

---

## Project structure

```
app/
  layout.tsx            Root layout: fonts, auth provider
  login/                Login page
  (app)/                Every page behind login (one folder per route)
    layout.tsx          Sidebar shell; redirects to /login when signed out
components/
  ui/                   shadcn/ui components
  master-page.tsx       Generic master-data page (list, form, import, filters)
  data-table.tsx        Table for live collections
  journal-view.tsx      Shows a journal entry and links to its document
  aging-page.tsx        Shared payables / receivables aging
  statement-table.tsx   Balance sheet / P&L grid
  imports/              The four one-time import screens
  app-sidebar.tsx       Navigation (the `nav` list)
hooks/
  use-collection.ts     Realtime Firestore list with filters
  use-inventory.ts      Inventory valuation data
  use-hpp.ts            Monthly cost of production
lib/
  firebase.ts           Firebase app, auth, db
  db.ts                 Logged writes, transactions, document numbers
  collections.ts        Collection names, record types, accounts, defaults
  stock.ts              Stock movements
  journal.ts            Journal entries, bank, ledger helpers, periods
  purchase.ts sales.ts  Invoices, payments, receipts
  inventory.ts hpp.ts   Costing
  statements.ts         Balance sheet and P&L layouts
  …                     One file per feature (weighing, processing, usage, rolls, vat, …)
firestore.rules         Database security rules (publish in the Firebase console)
AGENTS.md               Development conventions (read before changing code)
assets/fonts/           Aktura logo font and its licence
```

---

## Adding a feature

1. Create `app/(app)/<route>/page.tsx` (Indonesian UI text).
2. Add `{ title, url, icon }` under a section in `nav` in `components/app-sidebar.tsx`.
3. Add record types and the collection name to `lib/collections.ts`.
4. Write through `lib/db.ts` (`transaction`, `addRecord`, …). Use `addStock` for stock, `post` for journals, and the matching `ensure…Open` lock checks.
5. Add a rule for the new collection in `firestore.rules`, and publish it.
6. Gate role-specific actions with `useIsAdmin` / `useCanCloseMonth` / `useCanManageRoles`, which already include Master and Developer.
7. Mark mandatory inputs `required` (the label gets a red `*` automatically).
8. Run `npm run build` and `npm run lint`.

Code-keyed master data should use `<MasterPage>`; see `AGENTS.md`.

---

## Known limitations and decisions

- **Client-only security:** there is no server. Anyone signed in can call Firestore directly, limited only by `firestore.rules`. In particular, the change log covers writes made through the app; it cannot detect a user writing directly with their own code.
- **Imported 2025 washing outputs** have no inputs in Excel, so they carry no cost in inventory valuation.
- **Sales need finished-goods stock:** a sales invoice for a product is refused until its production is recorded in Barang jadi.
- **Fixed values in code:** payment approval limit (Rp 100.000.000), weighing tolerance (0,5%), stock-count limits (1% / 500 kg), loom defaults (width 4,13 m). They are in `lib/collections.ts`, `lib/stock-count.ts` and `LOOM_DEFAULTS`.
- **Reopening a closed warehouse or loom month** is not in the app (delete `periods/{month}` or `loomPeriods/{month}` in the console). Accounting months can be reopened by an Admin.
- **Statements and costing** follow the Excel layouts and should be reviewed by the company's accountant, especially the cost flow (raw material → WIP → finished goods → COGS).
