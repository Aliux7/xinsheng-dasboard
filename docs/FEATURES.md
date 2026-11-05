# Xinsheng — removed features (reference)

On 2026-11-05 the app was cut back to its foundation: **auth, users (roles), change logs**. Everything below
was removed from the code. This file is the record of what existed, so features can be rebuilt.

- Rebuilt since: **Buku bank** (page `/bank`, `banks`, `bankTransactions`, BANK BOOK import) without the journal link — see AGENTS.md.
- Code of the features as last committed: git commit `adfcd6e` ("add proxy + import for buku bank").
  Recover a file with `git show adfcd6e:<path>` or `git checkout adfcd6e -- <path>`.
- Work from the session of 2026-11-04 was **never committed** and is described only here
  (section "Uncommitted work of 2026-11-04").
- Appendix A = the full `firestore.rules`, Appendix B = the full project conventions (AGENTS.md) as they
  were before the clean-up.

Stack: Next.js 16 (App Router, `proxy.ts`), client-only Firebase (Auth + Firestore, no backend), shadcn/ui
(base-ui), Tailwind 4, `read-excel-file` / `write-excel-file` for Excel, `recharts` for charts.
All UI text in Indonesian, dates/numbers `id-ID`.

---

## 1. Pages that existed (sidebar)

| Section | Route | Page | What it did |
|---|---|---|---|
| Ringkasan | `/` | Dasboard | KPIs: stock in/used, sales, receivables/payables, charts (`AreaTrend`, `Donut`, `Bars`) |
| Data Master | `/suppliers` | Pemasok | Master data (code SUP…), Excel import |
| | `/purchase-items` | Item pembelian | Purchase item codes (IA…) used on purchase invoices |
| | `/materials` | Bahan baku gudang | Warehouse materials (BB…): group, unit, department, condition original/dirty/clean/recycled, `cleanTo`, min stock, live `stock` |
| | `/departments` | Departemen | Departments |
| | `/looms` | Tipe kain & mesin loom | Loom machines/cloth types, cloth grades |
| | `/products` | Item penjualan | Products (loom base cloth, type, size, colour, Chinese names) |
| | `/customers` | Pelanggan | Customers (CUS0001…), area, Chinese area, terms |
| Gudang | `/weighings` | Timbangan masuk | Truck weighing: weight1 on arrival, weight2 on departure → net kg into stock (TM/26J00001) |
| | `/processings` | Cuci & recycle | Washing/recycling: inputs out, output in, shrinkage |
| | `/usage` | Pemakaian bahan | Material usage (OUT/…), stock goes down |
| | `/stock` | Stok sekarang | Current stock per material, min-stock warnings |
| | `/stock-card` | Kartu stok | Movements of one material with running balance |
| | `/stock-counts` | Stok opname | Stock count; differences >1% or >500 kg need Admin approval |
| Kain loom | `/rolls` | Panen roll | Cloth rolls harvested from looms (`rolls/{number}`, counter `ROLL`), status Di stok → Dikeluarkan |
| | `/cloth-stock` | Stok kain loom | Rolls in stock |
| | `/loom-report` | Laporan loom bulanan | Monthly loom report; closes loom months (`loomPeriods`) |
| Biaya & produksi | `/material-mapping` | Pemetaan kode bahan | Material (BB) ↔ purchase items (IA) map (`materialMaps`) for costing |
| | `/matching` | Pencocokan timbangan | Weighings ↔ purchase invoices, kg tolerance, Admin approval of differences |
| | `/inventory-value` | Nilai persediaan | Monthly weighted-average value per material; posts material used (WIP 105201 / raw 105101) |
| | `/hpp` | HPP bulanan | Monthly cost statement like the Excel COGS sheet |
| | `/finished-goods` | Barang jadi | FG production: issued rolls → product stock, journal 105301 / 105201 |
| Laporan | `/balance-sheet` | Neraca | Balance sheet by month (NERACA layout, report lines NR..) |
| | `/profit-loss` | Laba rugi | P&L by month (LABARUGI layout, report lines LR..) |
| | `/stock-report` | Laporan stok bulanan | Begin / in / used / shrinkage / adjustment / end per material; closes warehouse months (`periods`) |
| | `/usage-summary` | Rekap pemakaian harian | Daily usage summary |
| Pembelian | `/purchase-invoices` | Faktur pembelian | Purchase invoices (PI/…), VAT, PPh withheld, linked weighings, journal |
| | `/import-purchases` | Pembelian impor | Import purchases (PIB): customs value, duties, journal |
| | `/supplier-payments` | Pembayaran utang | Supplier payments (BBK), allocations to invoices, Admin approval above Rp 100 jt |
| | `/payables-aging` | Umur utang | Payables aging (`components/aging-page.tsx`) |
| Penjualan | `/deliveries` | Surat jalan | Delivery notes `DO-YYMMDDNNN`; finished goods leave stock here; print/Excel like sheet SJ-IND |
| | `/sales-invoices` | Faktur penjualan | Sales invoices `YYMMDDNNN` billing delivery notes (or "Faktur langsung"); COGS; print/Excel like sheet FAKTUR |
| | `/customer-receipts` | Penerimaan piutang | Customer receipts (BBM), allocations, difference account |
| | `/receivables` | Umur piutang & penjualan | Receivables aging and sales |
| Pajak | `/vat` | Rekap PPN bulanan | VAT summary from the ledger; mark month reported (`vatPeriods`) → locks invoices |
| | `/withholding` | Daftar PPh dipotong | PPh withheld on purchase invoices, mark paid (date + NTPN) |
| Akuntansi | `/accounts` | Daftar akun | Chart of accounts (type, normal balance, report line), Excel import with guesses |
| | `/report-lines` | Baris laporan | Report lines NR../LR.. |
| | `/journal` | Jurnal umum | Manual entries `JV-0001/X/26`, reversal, 2025 journal import |
| | `/bank` | Buku bank | Bank book per own bank, quick entry, transfer, reconciliation, BANK BOOK import |
| | `/bank-journal` | Jurnal buku bank | (uncommitted, see below) journal unjournalled bank rows |
| | `/ledger` | Buku besar | Ledger of one account with running balance |
| | `/trial-balance` | Neraca saldo | Trial balance for a period |
| | `/accounting-periods` | Tutup periode akuntansi | Close/reopen accounting months with checklist |
| Admin | `/users` | Pengguna | **kept** |
| | `/logs` | Riwayat perubahan | **kept** |
| | `/imports` | Impor data | One-time imports: warehouse history, loom rolls, 2025 journal, 2025 purchase invoices |
| | `/settings` | Pengaturan | Company letterhead (`settings/company`), own banks (`banks`), receiving bank accounts |

Print routes: `app/(print)/deliveries/[id]/print`, `app/(print)/sales-invoices/[id]/print` (`PrintPage`,
`DeliverySheet`, `InvoiceSheet`, `@page { margin: 0 }`, 12 mm padding).

## 2. Firestore collections that existed

Kept: `users`, `logs`. Removed (data may still be in Firestore; the rules no longer allow access):

| Collection | Content |
|---|---|
| `suppliers`, `departments`, `materials`, `products`, `accounts`, `reportLines`, `purchaseItems`, `clothGrades`, `looms`, `customers`, `receivingAccounts`, `banks` | Master data at `<col>/{code}`; never deleted, deactivated |
| `stockMovements` | Every stock change (`addStock`): kind, material, date, qty ±, balanceAfter, source |
| `weighings`, `processings`, `usages`, `stockCounts` | Warehouse documents (never edited; corrections are new documents) |
| `periods/{YYYY-MM}` | Closed warehouse months with report figures |
| `rolls/{number}`, `loomPeriods/{YYYY-MM}` | Cloth rolls, closed loom months |
| `journals` | Balanced entries (`lines`, `accounts` array, `source`, `number`, `reverses`/`reversedBy`, `document`, `bankTransactions`) |
| `accountingPeriods/{YYYY-MM}` | Closed/open accounting months |
| `bankRecs/{bank}-{YYYY-MM}` | Bank reconciliations |
| `bankTransactions` | (uncommitted) Buku bank rows separate from journals |
| `purchaseInvoices`, `importPurchases`, `supplierPayments` | Purchases and payments |
| `salesInvoices`, `deliveries`, `customerReceipts` | Sales |
| `vatPeriods/{YYYY-MM}` | VAT months reported |
| `materialMaps`, `fgProductions`, `inventoryPostings` | Costing |
| `settings/company` | Letterhead |
| `imports/{name}` | Markers so one-time imports can't run twice |
| `counters/{…}` | Number counters: `{PREFIX-YYYY-MM}`, `{PREFIX-YYYY-MM-DD}`, `JV-YYYY-MM`, `BBM-/BBK-{bank}-YYYY-MM`, `ROLL` |

## 3. Library modules that existed (`lib/`, `hooks/`, `components/`)

- `lib/collections.ts` — all collection names and record types, `STOCK_KINDS`, `DEFAULT_BANKS`, `PURCHASE_ACCOUNTS`, `SALES_ACCOUNTS`, `INVENTORY_ACCOUNTS`, `LOOM_DEFAULTS`, statuses.
- `lib/master.ts` + `components/master-page.tsx` — generic master-data page (code unique and locked, search, active, Excel import with preview, `groupBy`, `autoCode`).
- `lib/stock.ts` — `addStock` (only way to change stock, never below zero), `ensureStock`, `stockErrors`.
- `lib/period.ts` — closed warehouse months, `ensureOpen`, `monthOf`, `PERIODS`.
- `lib/weighing.ts`, `lib/processing.ts`, `lib/usage.ts`, `lib/stock-count.ts`, `lib/report.ts` — warehouse documents and the monthly stock report.
- `lib/rolls.ts`, `lib/loom-report.ts` — loom rolls and report, `ensureLoomOpen`.
- `lib/journal.ts` — `post`, `saveJournal`, `reverseJournal`/`reverseIn`, `saveTransfer`, numbering (`jvNumber`, `bankNumber`), `linesOf`, `trialBalance`, `reconciliation`, `saveBankRec`, accounting period close/reopen, `ensureAccountingOpen`, `bankOf`.
- `lib/accounting.ts` — account import: Excel groups → account type, report-line guesses.
- `lib/statements.ts` — balance sheet / P&L layouts (`BALANCE_LAYOUT`, `PNL_LAYOUT`) from report lines.
- `lib/purchase.ts` — purchase invoices, import purchases, payments (approval), weighing matching, `statusOf`, PPh paid.
- `lib/sales.ts`, `lib/deliveries.ts`, `lib/finished-goods.ts` — sales invoices, delivery notes (`createDelivery`), receipts, COGS, FG stock.
- `lib/documents.ts`, `lib/print-layout.ts`, `components/delivery-sheet.tsx`, `components/invoice-sheet.tsx`, `components/print-page.tsx`, `components/letterhead.tsx` — printed documents and their Excel version.
- `lib/inventory.ts`, `hooks/use-inventory.ts` — weighted-average inventory valuation, material-used posting.
- `lib/hpp.ts`, `hooks/use-hpp.ts` — monthly cost statement.
- `lib/vat.ts`, `lib/vat-report.ts` — VAT lock and summary.
- `lib/aging.ts`, `components/aging-page.tsx` — aging.
- `lib/excel.ts`, `lib/excel-template.ts`, `lib/export.ts`, `components/import-template.tsx`, `components/import-dialog.tsx` — Excel import templates (black header = required, yellow = optional) and export.
- One-time imports: `lib/history-import.ts`, `lib/roll-import.ts`, `lib/journal-import.ts`, `lib/purchase-import.ts`, `components/imports/*`.
- Bank: `lib/bank-import.ts`, `components/bank-import.tsx`, `hooks/use-banks.ts` (+ uncommitted `lib/bank-book.ts`, `components/bank-voucher-link.tsx`).
- UI helpers: `account-select`, `account-multi-select` (uncommitted), `filter-select`, `month-picker`, `year-field`, `number-input` (id-ID grouping), `material-lines`, `reason-dialog`, `statement-table`, `journal-view` (`JournalView`/`JournalDialog`, `DOCUMENT_PAGES`), charts `area-trend`, `mini-charts`, `chart-tone`, `hooks/use-company.ts`, `hooks/use-today.ts`.
- `scripts/remove-bank-journals.mjs` (uncommitted) — firebase-admin script deleting journals of one bank source.

## 4. Uncommitted work of 2026-11-04 (not in git)

1. **Statement filter by account**: Neraca and Laba Rugi got an "Akun" multi-select (`AccountMultiSelect`, base-ui Combobox `multiple` with chips). `balanceSheet(…, only)` / `profitAndLoss(…, only)` limit every line (incl. retained/current earnings) to the chosen accounts; the "Selisih" row hidden while filtered; P&L offers only P&L accounts (`isPnl` exported).
2. **Dialogs max 90% height**: `DialogContent` got `max-h-[90dvh] overflow-y-auto overscroll-contain`.
3. **Accounting periods page**: months listed from the earliest journal *or* earliest period doc (so a closed month without entries can be reopened); closing blocked while bank rows of the month are unjournalled.
4. **Buku bank separated from the journal** (`bankTransactions`, `lib/bank-book.ts`):
   - Row: bank, date, number (BBM/BBK.YY.MM.NNNN; rows sharing it = one voucher), name, description, descriptionZh, note, amount (+in/−out), contra ("" until known), opening flag, origin (manual | import file/sheet/row), journalId/journalNumber (null until journalled), stock lines.
   - `saveBankRows` (import; sheet numbers kept and counters moved past them, else next number), `saveBankRow` (quick entry; journalled at once when a contra is given), `updateBankRow` / `deleteBankRow` (only while unjournalled), `postBankVoucher` (one entry per voucher: bank line + contra line per row, per-line dates, entry field `bankTransactions`), `bookEntries` (rows + bank lines of entries without `bankTransactions`), `contraError` (not the bank itself, not receivable/payable), `contraGuesser` / `descriptionKey` (guess contra from earlier rows; key ignores years, amounts, long numbers, month names, keeps short numbers so PPh 23 ≠ PPh 4(2)).
   - `reverseIn` reopened the rows (journalId null) and took bought stock out again; the reversal carried the same `bankTransactions` so the book didn't show it.
   - Rule: rows editable/deletable only while unjournalled and the month open; once journalled only `journalId`, `journalNumber`, `stock` may change.
   - Pages: Buku bank (book with "Belum dijurnal" badge, edit/delete dialog, quick entry with optional contra, reconciliation on book entries) and **Jurnal buku bank** `/bank-journal` (unjournalled rows by bank/month, contra per row, bulk fill by text, "Isi juga" for same description, guesses from history, tick per voucher, "Jurnalkan", "Simpan akun lawan saja").
   - `JournalView` allowed "Buat jurnal balik" on any entry without a document (incl. bank entries).
5. **BANK BOOK import** (client workbook "BANK BOOK XS 2026.xlsx"): one sheet per account, user picks the sheet; header row found by "Date / Debet / Credit" (English row 3, Chinese row 4, data from row 5), columns by header name (Date, Voucher/GL No., Name, Descriptions, Chinese description = unnamed column after Descriptions, Debet, Credit, Balance, Remarks); "Beginning Balance" (any column) = opening (optional opening row), "Sub Total"/"Total" and empty rows skipped; consecutive rows with the same voucher = one voucher, a reused number later gets an automatic number; checks: running balance, Debet+Credit both filled, BBM/BBK prefix vs direction, month in number vs date, duplicates vs the book; saved in chunks of 150 rows.
   Data issues found in that workbook: no contra-account column; reused voucher numbers (4 in REK PT 2098, 2 NR, 10 ENNY, 7 REK PT 1177); numbers whose month ≠ date; rows with no amount (NR 234, REK PT 1177 173–174); TEST rows of Rp 1; ENNY row 236 with Debet and Credit; ENNY account 5060544842 had no bank in the app; DEFAULT_BANKS bca1/bca3 held bank account numbers instead of chart-of-account numbers.
6. **Payments/receipts settle bank rows**: from Jurnal buku bank, "Pembayaran pemasok" / "Penerimaan pelanggan" links (`?bank=&voucher=`) opened the form with bank/date locked and the voucher's rows ticked (`useBankLink`, `BankLinkPanel`); `claimBankRows` checked bank, unjournalled, one voucher, sum = payment total / received; the entry kept the voucher number, `markBankRows` linked the rows (no double line in the book).
7. **Stock bought through the bank**: contra in `STOCK_ACCOUNTS` (105101, 105102, 105201) required material + kg (`MaterialLines`; kg prefilled from "… kg x price" when kg × price matched the amount, material guessed from earlier rows); posting added stock movements kind `bankPurchase` with `value` (paid amount split by kg) and `account`; valuation took them at that value; stock report counted them as "in"; reversal took them out. Open question left: 105201 is WIP, so material-used posting would double-count it.

## 5. Business rules worth keeping when rebuilding

- Document numbers: PREFIX/YY + month letter (A = Jan … L = Dec) + 5 digits (TM/26J00001); delivery notes `DO-YYMMDDNNN`, sales invoices `YYMMDDNNN`; manual journal `JV-0001/X/26`; bank `BBM.26.10.0001` / `BBK.…` per bank per month.
- Stock never below zero; stock documents never edited or deleted; corrections are new documents.
- Journals never edited; reversed. Every money movement = one balanced entry.
- Month locks: warehouse (`periods`), loom (`loomPeriods`), accounting (`accountingPeriods`), VAT (`vatPeriods`).
- Printed documents follow the client's Excel sheets exactly; parts without data are left out.
- Charts: positive green, negative red, bolder = bigger, gradient fills; B&W palette with brand blue `#2C3480`.

---

## Appendix A — firestore.rules before the clean-up

```
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() { return request.auth != null; }

    // Roles live on users/{uid}.role: Developer > Master > Admin > Staff (empty).
    // Master and Developer can do everything; the first Developer is set in the Firebase console.
    function role() { return get(/databases/$(database)/documents/users/$(request.auth.uid)).data.get("role", ""); }
    function rank(r) { return {"developer": 3, "master": 2, "admin": 1}.get(r, 0); }
    function isSuper() { return signedIn() && role() in ["master", "developer"]; }
    function isAdmin() { return signedIn() && role() in ["admin", "master", "developer"]; }
    function canClose() { return isAdmin(); }

    // A month is locked once periods/{YYYY-MM} exists (Tutup buku).
    function openMonth(date) {
      let p = date.split("-");
      return !exists(/databases/$(database)/documents/periods/$(p[0] + "-" + p[1]));
    }

    // Master data (lib/master.ts): stored at <col>/{code}; the code never
    // changes and records are deactivated, never deleted. Add new ones here.
    function isMaster(col) { return col in ["suppliers", "departments", "materials", "products",
                                  "accounts", "reportLines", "purchaseItems",
                                  "clothGrades", "looms", "customers", "receivingAccounts", "banks"]; }

    // Collections with their own rules below; the catch-all must not open them up.
    function reserved(col) { return col in ["logs", "users", "periods", "imports", "rolls", "loomPeriods",
                                  "journals", "accountingPeriods", "bankRecs", "bankTransactions",
                                  "purchaseInvoices", "importPurchases", "supplierPayments",
                                  "salesInvoices", "customerReceipts", "vatPeriods", "deliveries", "settings",
                                  "fgProductions", "inventoryPostings", "weighings", "stockCounts",
                                  "stockMovements", "processings", "usages"]; }

    // Change history: add only, attributed to the writer.
    match /logs/{id} {
      allow read: if signedIn();
      allow create: if signedIn() && request.resource.data.by.uid == request.auth.uid;
    }

    // users/{uid}: anyone edits their own profile but never its role.
    // Master/Developer change only the role, of a user ranked below them, to a role below
    // theirs: a Developer's role can never be changed, a Master's only by a Developer.
    match /users/{uid} {
      allow read: if signedIn();
      allow create: if signedIn() && request.auth.uid == uid && !("role" in request.resource.data);
      allow update: if signedIn() && (
        (request.auth.uid == uid && request.resource.data.get("role", "") == resource.data.get("role", ""))
        || (isSuper()
          && request.resource.data.diff(resource.data).affectedKeys().hasOnly(["role"])
          && request.resource.data.role in ["", "master", "admin"]
          && rank(resource.data.get("role", "")) < rank(role())
          && rank(request.resource.data.role) < rank(role())));
    }

    // Loom months close separately from the warehouse: loomPeriods/{YYYY-MM}.
    function openLoom(date) {
      let p = date.split("-");
      return !exists(/databases/$(database)/documents/loomPeriods/$(p[0] + "-" + p[1]));
    }
    match /loomPeriods/{month} {
      allow read: if signedIn();
      allow create: if canClose();
    }

    // Cloth rolls: rolls/{roll number}; never deleted; only "Di stok" → "Dikeluarkan".
    match /rolls/{id} {
      allow read: if signedIn();
      allow create: if signedIn() && id == string(request.resource.data.number) && openLoom(request.resource.data.date);
      allow update: if signedIn() && ((resource.data.status == "instock" && request.resource.data.status == "issued"
          && openLoom(request.resource.data.issueDate))
        // An issued roll is consumed once by a finished-goods production.
        || (resource.data.status == "issued" && !("usedIn" in resource.data)
          && request.resource.data.diff(resource.data).affectedKeys().hasOnly(["usedIn"])));
    }

    // Accounting months: accountingPeriods/{YYYY-MM} with status "closed" locks journals dated in it.
    function openAccounting(date) {
      let p = date.split("-");
      let path = /databases/$(database)/documents/accountingPeriods/$(p[0] + "-" + p[1]);
      // Read the period only when it exists (short-circuit), so open months never error.
      return !exists(path) || get(path).data.status != "closed";
    }
    match /accountingPeriods/{month} {
      allow read: if signedIn();
      // Closing: Admin (and Master/Developer), also reopening a closed month.
      allow create: if canClose() && request.resource.data.status == "closed";
      allow update: if (resource.data.status != "closed" && canClose())
        || (resource.data.status == "closed" && request.resource.data.status == "open" && isAdmin());
    }

    // Journal entries are never edited or deleted; the only change is recording their reversal.
    match /journals/{id} {
      allow read: if signedIn();
      allow create: if signedIn() && openAccounting(request.resource.data.date);
      allow update: if signedIn() && openAccounting(resource.data.date)
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly(["reversedBy"]);
    }

    // Buku bank rows (lib/bank-book.ts): changed or deleted only while not journalled and the month is
    // open; once journalled only the journal link changes (back to null, with its raw material, when the entry is reversed).
    match /bankTransactions/{id} {
      allow read: if signedIn();
      allow create: if signedIn() && openAccounting(request.resource.data.date);
      allow update: if signedIn() && openAccounting(resource.data.date) && openAccounting(request.resource.data.date)
        && (resource.data.journalId == null
          || request.resource.data.diff(resource.data).affectedKeys().hasOnly(["journalId", "journalNumber", "stock"]));
      allow delete: if signedIn() && openAccounting(resource.data.date) && resource.data.journalId == null;
    }

    // Bank reconciliations, per bank per month, while the month is open.
    match /bankRecs/{id} {
      allow read: if signedIn();
      allow create, update: if signedIn() && openAccounting(request.resource.data.month + "-01");
    }

    // Purchase invoices: created with their journal; afterwards only payments change them.
    match /purchaseInvoices/{id} {
      allow read: if signedIn();
      // The 2025 import creates invoices in closed months, linked to existing journals.
      allow create: if signedIn() && ((openAccounting(request.resource.data.date) && vatOpen(request.resource.data.date))
        || (request.resource.data.imported == true && canClose()));
      // Payments and PPh deposit by anyone; approving a weighing difference only by an Admin.
      allow update: if (signedIn()
          && request.resource.data.diff(resource.data).affectedKeys().hasOnly(["payments", "paid", "remaining", "status", "whtPaid"]))
        || (isAdmin() && resource.data.matchStatus == "pending"
          && request.resource.data.diff(resource.data).affectedKeys().hasOnly(["matchStatus", "matchApprovedBy"]));
    }
    match /importPurchases/{id} {
      allow read: if signedIn();
      allow create: if signedIn() && openAccounting(request.resource.data.pibDate) && vatOpen(request.resource.data.pibDate);
    }
    // Supplier payments above the limit wait for an Admin, who alone can post or reject them.
    match /supplierPayments/{id} {
      allow read: if signedIn();
      allow create: if signedIn() && openAccounting(request.resource.data.date)
        && (request.resource.data.status == "pending" || request.resource.data.total <= 100000000 || isAdmin());
      allow update: if isAdmin() && resource.data.status == "pending";
    }

    // VAT months marked reported lock purchase, import and sales invoices dated in them.
    function vatOpen(date) {
      let p = date.split("-");
      let path = /databases/$(database)/documents/vatPeriods/$(p[0] + "-" + p[1]);
      return !exists(path) || get(path).data.reported != true;
    }
    match /vatPeriods/{month} {
      allow read: if signedIn();
      allow create, update: if canClose();
    }

    // Sales invoices: created with their journal; afterwards only receipts change them,
    // or a cancellation while nothing is paid (its journal is reversed in the same transaction).
    match /salesInvoices/{id} {
      allow read: if signedIn();
      allow create: if signedIn() && openAccounting(request.resource.data.date) && vatOpen(request.resource.data.date);
      allow update: if signedIn() && resource.data.status != "cancelled" && ((request.resource.data.status != "cancelled"
          && request.resource.data.diff(resource.data).affectedKeys().hasOnly(["payments", "paid", "remaining", "status"]))
        || (resource.data.paid == 0 && request.resource.data.status == "cancelled"
          && openAccounting(resource.data.date) && vatOpen(resource.data.date)
          && request.resource.data.diff(resource.data).affectedKeys().hasOnly(["status", "remaining", "cancelReason", "cancelledBy"])));
    }

    // Delivery notes (Surat jalan): never edited or deleted. Only billed by an invoice (and back when the
    // invoice is cancelled), or cancelled while not invoiced, in an open warehouse month.
    match /deliveries/{id} {
      allow read: if signedIn();
      allow create: if signedIn() && openMonth(request.resource.data.date)
        && request.resource.data.status in ["open", "invoiced"];
      allow update: if signedIn() && (
        (resource.data.status in ["open", "invoiced"] && request.resource.data.status in ["open", "invoiced"]
          && request.resource.data.diff(resource.data).affectedKeys().hasOnly(["status", "invoiceId", "invoiceNumber"]))
        || (resource.data.status == "open" && request.resource.data.status == "cancelled" && openMonth(resource.data.date)
          && request.resource.data.diff(resource.data).affectedKeys().hasOnly(["status", "cancelReason", "cancelledBy"])));
    }

    // Company settings (letterhead): Admin (and Master/Developer) only.
    match /settings/{id} {
      allow read: if signedIn();
      allow create, update: if isAdmin();
    }
    match /customerReceipts/{id} {
      allow read: if signedIn();
      allow create: if signedIn() && openAccounting(request.resource.data.date);
    }

    match /fgProductions/{id} {
      allow read: if signedIn();
      allow create: if signedIn() && openAccounting(request.resource.data.date);
    }
    // Raw material used, posted once per closed warehouse month.
    match /inventoryPostings/{month} {
      allow read: if signedIn();
      allow create: if canClose();
    }
    match /materialMaps/{id} {
      allow read, write: if signedIn();
    }

    // One-time imports (e.g. imports/warehouse-history): Admin (and Master/Developer) only.
    match /imports/{id} {
      allow read: if signedIn();
      allow create, update: if canClose();
    }

    // Closed months: created once by an Admin, never changed.
    match /periods/{month} {
      allow read: if signedIn();
      allow create: if canClose();
    }

    // Truck weighings: never deleted; only a truck still on site, in an open month, can change.
    match /weighings/{id} {
      allow read: if signedIn();
      allow create: if signedIn() && openMonth(request.resource.data.date);
      allow update: if signedIn() && ((resource.data.status == "onsite"
          && openMonth(resource.data.date) && openMonth(request.resource.data.date))
        // A finished weighing can only be linked once to the purchase invoice that pays for it.
        || (resource.data.status == "stocked" && !("invoiceId" in resource.data)
          && request.resource.data.diff(resource.data).affectedKeys().hasOnly(["invoiceId"])));
    }

    // Stock counts: big differences can only be posted by an Admin.
    function withinLimit(d) {
      return math.abs(d.difference) <= 500 && math.abs(d.difference) <= 0.01 * math.abs(d.systemBalance);
    }
    match /stockCounts/{id} {
      allow read: if signedIn();
      allow create: if signedIn() && openMonth(request.resource.data.date)
        && (request.resource.data.status == "pending" || withinLimit(request.resource.data) || isAdmin());
      allow update: if isAdmin() && resource.data.status == "pending" && openMonth(resource.data.date);
    }

    // Permanent history: add only (in an open month), never edited or deleted.
    match /{col}/{id} {
      allow read: if signedIn() && col in ["stockMovements", "processings", "usages"];
      allow create: if signedIn() && col in ["stockMovements", "processings", "usages"]
        && openMonth(request.resource.data.date);
    }

    match /{col}/{id} {
      allow read: if signedIn() && !reserved(col);
      allow create: if signedIn() && (isMaster(col)
        ? request.resource.data.code == id
        : !reserved(col));
      allow update: if signedIn() && (isMaster(col)
        ? request.resource.data.code == resource.data.code
        : !reserved(col));
      allow delete: if signedIn() && !isMaster(col) && !reserved(col);
    }
  }
}
```

## Appendix B — AGENTS.md before the clean-up

<!-- BEGIN:nextjs-agent-rules -->

### This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

### Project conventions

- **Client-only Firebase, no backend.** `lib/firebase.ts` exports `auth` and `db`. There is no server code, firebase-admin or API route. The only server-side piece is `proxy.ts`: it redirects to /login when the "signed in" cookie (`lib/auth-cookie.ts`, set by `AuthProvider`) is missing; it is a hint, not security.
- **Auth:** `useAuth()` from `components/auth-provider.tsx`. Pages under `app/(app)/` are protected by `app/(app)/layout.tsx`. Each login user has a `users/{uid}` profile, created on first login.
- **Documents that change together** (e.g. a weighing + stock): `transaction(async (w) => …)` from `lib/db.ts`; all-or-nothing and still logged. Document numbers use the company format PREFIX/YY + month letter (A = Jan … L = Dec) + 5 digits, e.g. TM/26J00001: `nextNumber(w, "TM", date)` inside the same transaction (counters in `counters/{PREFIX-YYYY-MM}`).
- **Stock only changes through `addStock(w, { kind, … })`** (`lib/stock.ts`): it updates `materials/{code}.stock` and writes a `stockMovements` entry (kind from `STOCK_KINDS`, balance after, time). It refuses to go below zero; check first with `ensureStock` (in the transaction) and `stockErrors` (live in the form). Never edit `stock` from a form.
- **Roles:** `users/{uid}.role` = `developer` > `master` > `admin` > Staff (empty). **Master and Developer are allowed in every feature**; Admin does approvals, closing/reopening months and imports. Roles are changed on the Pengguna page by Master/Developer only, for users ranked below them and only to a role below theirs (so a Developer can never be changed, a Master only by a Developer); `roleRank()` in `components/auth-provider.tsx` and `rank()` in `firestore.rules` must match. The first Developer is set in the Firebase console. Use `useIsAdmin()` / `useCanCloseMonth()` / `useCanManageRoles()` (they already include Master/Developer) and the matching `isAdmin()` / `canClose()` / `isSuper()` in `firestore.rules`. Any new role-gated feature must allow Master and Developer too.
- **Closed months (Tutup buku):** `periods/{YYYY-MM}`. Every transaction that adds or changes something dated must call `ensureOpen(w, date)` (`lib/period.ts`; `addStock` already does), and its rule must use `openMonth(date)`.
- **Loom cloth rolls** (`lib/rolls.ts`): `rolls/{roll number}`, numbers from `counters/ROLL`; status Di stok → Dikeluarkan only (never deleted). Loom months lock separately in `loomPeriods/{YYYY-MM}`: call `ensureLoomOpen(w, date)`; rule `openLoom(date)`. Width default and other loom defaults: `LOOM_DEFAULTS` in `lib/collections.ts`.
- **Accounting** (`lib/journal.ts`): every money movement is one balanced entry in `journals` (lines inside, `accounts` array for queries). Create entries only via `saveJournal` / `postBankVoucher` / `saveTransfer` (or a future purchase/sales helper using the same `post`); entries are never edited — reverse with `reverseJournal`. Own banks are master data in `banks/{code}` (Pengaturan → Bank; `DEFAULT_BANKS` count until saved): read them with `useBanks()` in pages and `bankOf(w, code)` inside transactions; the code is the bank entry's journal source, BBM/BBK counter and `bankRecs` key, so it never changes. **Buku bank is separate from the journal** (`lib/bank-book.ts`): rows live in `bankTransactions` (amount + in / − out, voucher number, contra "" until known), typed with `saveBankRow` or imported from the client's BANK BOOK (`lib/bank-import.ts`, one sheet at a time, `saveBankRows`) without contra accounts; they stay editable/deletable (`updateBankRow` / `deleteBankRow`) until "Jurnal buku bank" (`/bank-journal`) posts one entry per voucher number with `postBankVoucher` (entry's `bankTransactions` = its rows). Reversing that entry sets the rows back to unjournalled. The book shows `bookEntries()`: these rows plus bank lines of entries without `bankTransactions` (payments, receipts, transfers). Contra checks: `contraError` (not the bank itself, not receivable/payable `INVOICE_ACCOUNTS`: invoice payments go through Penerimaan pelanggan / Pembayaran pemasok). A month can't close while its bank rows are unjournalled. Supplier payments / customer receipts can settle unjournalled rows (`bankRows`, opened from Jurnal buku bank with `?bank=&voucher=`): `claimBankRows` checks bank/amount, the entry keeps the voucher number and `markBankRows` links the rows, so the book never shows the payment twice. Numbers: manual `JV-0001/X/26`, bank `BBM.26.10.0001` / `BBK.…` per bank per month. Accounting months lock in `accountingPeriods/{YYYY-MM}` (status closed/open): `ensureAccountingOpen(w, date)`; rule `openAccounting(date)`. Pick accounts with `AccountSelect`; show an entry with `JournalView` / `JournalDialog`.
- **Documents with journals** (purchase/sales invoices, imports, payments, receipts, FG production, inventory posting) save the document and its entry in one `transaction`, using `post(w, entry, number, { document })` from `lib/journal.ts`; `JournalView` links back via `DOCUMENT_PAGES`. Invoice amounts change afterwards only through payments/receipts (`payments`, `paid`, `remaining`, `status`). Shared aging: `lib/aging.ts` + `components/aging-page.tsx`.
- **Sales and delivery notes** (`lib/deliveries.ts`, `lib/sales.ts`): finished goods leave stock only through a delivery note (`deliveries`, `createDelivery(w, …)`, status open → invoiced, or cancelled while open); never through the invoice. A sales invoice bills not-yet-invoiced delivery notes or creates one ("Faktur langsung") in the same transaction; COGS = the delivery notes' cost. `cancelSalesInvoice` reverses the journal with `reverseIn(w, …)` and sets its delivery notes back to open. These two keep the client's Excel numbers, not PREFIX/YY…: `DO-` + `nextDailyNumber(w, "DO", date)` and `nextDailyNumber(w, "SI", date)` → YYMMDDNNN (counters `counters/{PREFIX-YYYY-MM-DD}`).
- **Printed documents** (delivery note = sheet SJ-IND, sales invoice = sheet FAKTUR): `deliveryContent()` / `invoiceContent()` (`lib/documents.ts`) hold what is printed. "Cetak PDF" opens a print route (`app/(print)/deliveries/[id]/print`, `app/(print)/sales-invoices/[id]/print`) built on `PrintPage` (`components/print-page.tsx`: no app chrome, `@page { margin: 0 }` so browsers add no header/footer, 12 mm padding) rendering `DeliverySheet` / `InvoiceSheet` (one table per bordered box, 1px on all four sides). "Unduh Excel" writes `deliveryLayout` / `invoiceLayout` (a `PrintLayout` grid) with `downloadLayout` (`lib/print-layout.ts`: A4, fit to page, print area, no gridlines). Follow the client's Excel layout, keep every part, and leave a part out when its data is empty. Letterhead: `useCompany()` (`settings/company`, Pengaturan); receiving bank accounts: `receivingAccounts`.
- **Tax:** VAT months marked reported (`vatPeriods`) lock purchase/import/sales invoices via `ensureVatOpen` (rule `vatOpen`). VAT summary and statements read the ledger (`lib/vat-report.ts`, `lib/statements.ts`); statement lines come from accounts' report lines (NR../LR..).
- **Costing:** inventory value = monthly weighted average (`lib/inventory.ts`, `useInventory`); deliveries are valued through weighing ↔ invoice matching and `materialMaps` (BB ↔ IA); washing output takes its inputs' full cost; raw material bought straight from the Buku bank (contra in `STOCK_ACCOUNTS` = 105101 / 105102 / 105201 in Jurnal buku bank, material + kg chosen there) adds stock as `bankPurchase` valued at the paid amount (`value` on the movement), and reversing the entry takes it out again; material used posts WIP 105201 / raw material 105101 at warehouse close; FG production WIP → 105301; sales post COGS 510101 / 105301 via `lib/finished-goods.ts`.
- **Excel import:** every import shows a title + short description, a template preview and "Unduh template" / "Unggah file" via `ImportTemplate` / `ImportHeading` (`components/import-template.tsx`). Describe the sheet with `TemplateSheet` (`lib/excel-template.ts`): sheet name, header row, and each column the parser reads with `required` (header black/white) or optional (header yellow/black); keep it next to the parser so they stay in sync. Master-data imports pass `columns` (and optional `description`) in their `ImportSpec`.
- **Excel export:** `downloadExcel(fileName, sheet, header, rows)` or `downloadSheets(fileName, sheets)` (several sheets) from `lib/export.ts`.
- **Stock documents** (weighing, cuci/recycle, usage…) are never edited or deleted once saved; corrections are new documents. Reuse `MaterialLines` (material + kg rows), `useMonth` + `MonthPicker` and `FilterSelect` for history lists.
- **Every write goes through `lib/db.ts`** (`addRecord` / `updateRecord` / `deleteRecord`), never Firestore's `setDoc`/`updateDoc`/`deleteDoc` directly. They write the change and its `logs` entry in one transaction, which is what the Logs page shows.
- **Reading data:** `useCollection(path, { orderBy, desc, limit })` from `hooks/use-collection.ts` (realtime). Show lists with `components/data-table.tsx` by spreading the hook result: `<DataTable columns={...} {...result} />`.
- **Master data** (code-keyed records: suppliers, departments, …): build the page with `<MasterPage>` from `components/master-page.tsx`. Pass only the extra columns and form fields; optional props add Excel imports with preview (`importers`), filters grouping (`groupBy`), a `codeLabel`, and automatic codes (`autoCode="CUS"` → CUS0001…); it handles code (unique, locked after saving), search, Active, edit and deactivate (never delete). Collection names and record types live in `lib/collections.ts`; dropdowns use `components/simple-select.tsx`. Add the collection to `isMaster` in `firestore.rules`.
- **New page:** add `app/(app)/<name>/page.tsx` and one `{ title, url, icon }` under a section in `nav` in `components/app-sidebar.tsx` (also sets the header title). If it uses a new collection, add a rule in `firestore.rules`.
- **All UI text is Indonesian** (labels, buttons, messages, `noun`s like `noun="pemasok"`). Dates/numbers use `id-ID` via `lib/utils.ts`. Code, comments and Firestore field names stay English.
- **Mandatory fields show `*`:** put `required` on the input inside `<Field>`; `FieldLabel` adds the red `*` automatically (CSS in `components/ui/field.tsx`). Don't type `*` by hand, and keep this class if `field` is ever re-added with `shadcn add --overwrite`. Optional fields have no `required`.
- **UI:** shadcn/ui (base-ui flavour: `render` prop instead of `asChild`). Add components with `npx shadcn@latest add <name>` only when needed. Dates: `formatDate()` from `lib/utils.ts`. Numbers and amounts are typed in `NumberInput` (`components/number-input.tsx`): it shows id-ID grouping while typing (200000 → 200.000, "," = decimal) but stores the plain number; pass `plain` for values like a year.
- **Colours:** black & white is the main palette (primary buttons, text). Brand blue `#2C3480` is the support colour, via theme tokens in `app/globals.css` only: `--brand` (`bg-brand`, `text-brand`), `--secondary` (secondary buttons and badges, brand tint) and `--ring` (focus). Red (`--destructive`) is only for errors, overdue and losses.
- **Charts:** colour follows the value — positive = green, negative = red, bolder the bigger the amount, with gradient fills (`--chart-positive` / `--chart-negative`, shaded by `tone()` in `components/chart-tone.ts`). Use `AreaTrend` (`components/area-trend.tsx`) and `Donut` / `Bars` (`components/mini-charts.tsx`); they colour themselves, so pass values only (`warn` on a slice = red, e.g. overdue). No hard-coded chart colours.
- **Feedback:** every user action that writes shows a toast (`import { toast } from "sonner"`; `<Toaster />` is in `app/layout.tsx`): `toast.success("Faktur PI/26K00001 disimpan.")` with the document number/code, `toast.error(err.message)` on failure (never `alert`). Dialogs that already show an inline error keep it and only add the success toast.

