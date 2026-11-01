import type { Timestamp } from "firebase/firestore"

import type { MasterRecord } from "@/lib/master"

/** Firestore collection names and record shapes, shared between pages. */

export const SUPPLIERS = "suppliers"
export type Supplier = MasterRecord & {
  name: string
  phone: string
  address: string
  taxNumber: string
  /** Payment terms in days; sets a purchase invoice's due date. */
  paymentDays?: number | null
}

/** Codes match column E of the Excel usage sheet (OUT) and material list (KODE). */
export const DEPARTMENTS = "departments"
export type Department = MasterRecord & { name: string }

export const MATERIALS = "materials"
export const CONDITIONS = {
  original: "Asli",
  dirty: "Kotor – perlu dicuci",
  clean: "Bersih",
  recycled: "Daur ulang",
} as const
export type Condition = keyof typeof CONDITIONS
export type Material = MasterRecord & {
  name: string
  group: string
  unit: string
  /** Department code. */
  department: string
  condition: Condition
  /** Code of the Clean material this becomes after washing (only when Dirty). */
  cleanTo: string
  /** Minimum stock in `unit`, for warnings. Null = no warning. */
  minStock: number | null
  /** Current stock in `unit`. Only changed through `addStock` (lib/stock.ts), never by the form. */
  stock?: number
}

export const PRODUCTS = "products"
export type Product = MasterRecord & {
  /** Loom base cloth. */
  loom: string
  /** e.g. A2B */
  type: string
  /** e.g. 4x50m */
  size: string
  colour: string
  grossKg: number | null
  tubeKg: number | null
  netKg: number | null
  print: string
  /** Selling unit, e.g. roll. */
  unit: string
  /** Default selling price in Rp. */
  price: number | null
  /** Finished-goods stock (rolls) and its value; only changed by lib/finished-goods.ts. */
  fgQty?: number
  fgValue?: number
}

/** Lines of the balance sheet (NR..) and profit & loss (LR..) that accounts roll up into. */
export const REPORT_LINES = "reportLines"
export type ReportLine = MasterRecord & {
  name: string
  /** Account-number prefixes that fall on this line when no line is given, e.g. "5" or "61, 62". */
  prefixes: string
}

export type AccountType =
  | "asset"
  | "liability"
  | "equity"
  | "revenue"
  | "production"
  | "expense"
  | "otherIncome"
  | "otherExpense"

/** Chart of accounts: stored at `accounts/{6-digit number}`. */
export const ACCOUNTS = "accounts"
export type Account = MasterRecord & {
  nameId: string
  nameEn: string
  nameZh: string
  /** Group heading, e.g. Cash & Bank. */
  group: string
  /** Original group from Excel, as-is, e.g. Cash/Bank, Fixed Asset (Grup akun). Older accounts may not have it. */
  accountGroup?: string
  type: AccountType | null
  normalBalance: "debit" | "credit" | null
  /** Report line code, e.g. NR01. */
  reportLine: string
  /** Set when import guessed type or report line; cleared when the account is saved in the form. */
  needsReview: boolean
}

/** Purchase catalogue (Item pembelian). */
export const PURCHASE_ITEMS = "purchaseItems"
export const DEFAULT_BOOKING_ACCOUNT = "105101" // Persediaan bahan baku
export type PurchaseItem = MasterRecord & {
  name: string
  /** e.g. 原料 - 低压 HDPE */
  group: string
  /** Group code from the BAHAN sheet (column H), kept for reference. */
  groupCode: string
  unit: string
  /** Where it's used, e.g. Extruder / Laminasi. */
  remarks: string
  /** Account number from the chart of accounts. */
  account: string
}

/** Woven cloth grades, stored at `clothGrades/{code}` (F, G1, G2, M…). */
export const CLOTH_GRADES = "clothGrades"
export type ClothGrade = MasterRecord & {
  /** e.g. G1 54克 */
  name: string
  /** Standard weight in g/m². */
  weight: number | null
  /** Allowed difference ± g/m². */
  tolerance: number | null
  /** e.g. 兰灰布 ABU */
  baseCloth: string
}

/** Loom machines, stored at `looms/{machine number}`. */
export const LOOMS = "looms"
export type Loom = MasterRecord & { name: string }

/** Customers (Pelanggan), stored at `customers/{CUS0001…}`. */
export const CUSTOMERS = "customers"
export type Customer = MasterRecord & {
  name: string
  address: string
  city: string
  /** NPWP */
  taxNumber: string
  contact: string
  phone: string
  /** Payment terms in days. */
  paymentDays: number | null
  /** Rp; null = no limit. */
  creditLimit: number | null
}

/** Every stock change. A document can write several (e.g. washing: used, shrinkage, produced). */
export const STOCK_MOVEMENTS = "stockMovements"
/** Movement types, so reports can total each one (e.g. shrinkage per month). */
export const STOCK_KINDS = {
  receipt: "Timbangan masuk",
  processIn: "Hasil cuci/recycle",
  processOut: "Dipakai cuci/recycle",
  shrinkage: "Susut",
  usage: "Pemakaian",
  adjustment: "Penyesuaian stok opname",
} as const
export type StockKind = keyof typeof STOCK_KINDS
export type StockMovement = {
  id: string
  kind: StockKind
  material: string
  /** YYYY-MM-DD */
  date: string
  /** + in, − out, in the material's unit. */
  qty: number
  balanceAfter: number
  source: { type: string; id: string; number: string }
  at: Timestamp | null
}

/** Truck weighing (Timbangan masuk). Weighed full on arrival (weight1), empty on departure (weight2). */
export const WEIGHINGS = "weighings"
export const WEIGHING_STATUS = { onsite: "Di lokasi", stocked: "Masuk stok", cancelled: "Dibatalkan" } as const
export type Weighing = {
  id: string
  /** TM/26J00001 (YY + month letter + 5 digits), assigned on first save. */
  number: string
  /** YYYY-MM-DD */
  date: string
  plate: string
  driver: string
  container: string
  /** Supplier code. */
  supplier: string
  /** Material code. */
  material: string
  /** HH:MM */
  timeIn: string
  timeOut: string
  weight1: number
  weight2: number | null
  /** weight1 − weight2, set when weighed out. */
  net: number | null
  moisture: number | null
  notes: string
  status: keyof typeof WEIGHING_STATUS
  cancelReason: string
  /** Purchase invoice that pays for this delivery (Phase 9.2). */
  invoiceId?: string
}

/** Washing (Cuci, CC/…) and recycling into pellets (Recycle, RC/…). */
export const PROCESSINGS = "processings"
export const PROCESS_TYPES = { wash: "Cuci", recycle: "Recycle" } as const
export type ProcessType = keyof typeof PROCESS_TYPES
export type Processing = {
  id: string
  /** CC/26J00001 or RC/26J00001 */
  number: string
  type: ProcessType
  /** YYYY-MM-DD */
  date: string
  /** Materials taken out of stock, kg each. */
  inputs: { material: string; qty: number }[]
  /** Material that goes up by `cleanWeight`. */
  output: string
  wetWeight: number | null
  cleanWeight: number
  /** Total input − clean weight. */
  shrinkage: number
  /** Shrinkage ÷ total input × 100. */
  shrinkagePct: number
  reason: string
}

/** Material usage (Pemakaian bahan, OUT/…): stock taken by a department on a shift. */
export const USAGES = "usages"
export const SHIFTS = ["A", "B", "A&B"] as const
export type Usage = {
  id: string
  /** OUT/26J00001 */
  number: string
  /** YYYY-MM-DD */
  date: string
  shift: (typeof SHIFTS)[number]
  /** Department code. */
  department: string
  lines: { material: string; qty: number }[]
  total: number
}

/** Stock count (Stok opname, ADJ/…). Big differences wait for an Admin before stock changes. */
export const STOCK_COUNTS = "stockCounts"
export const COUNT_STATUS = { pending: "Menunggu persetujuan", posted: "Diposting", rejected: "Ditolak" } as const
export type StockCount = {
  id: string
  /** ADJ/26J00001 */
  number: string
  /** YYYY-MM-DD */
  date: string
  material: string
  /** Stock in the system when counted. */
  systemBalance: number
  counted: number
  /** counted − systemBalance; posted as an adjustment movement. */
  difference: number
  reason: string
  status: keyof typeof COUNT_STATUS
  countedBy: { uid: string; email: string | null }
  /** null = posted automatically (within the limit). */
  approvedBy: { uid: string; email: string | null } | null
  rejectReason: string
}

/** Woven cloth rolls from the looms, stored at `rolls/{roll number}`. */
export const ROLLS = "rolls"
export const ROLL_STATUS = { instock: "Di stok", issued: "Dikeluarkan" } as const
export type Roll = {
  id: string
  /** Running roll number, continuing the Excel numbering (1, 2, … 421…). */
  number: number
  /** YYYY-MM-DD (produced) */
  date: string
  /** Cloth grade code (Tipe kain), e.g. G1. */
  grade: string
  /** Loom machine number (Mesin loom). */
  machine: string
  kg: number
  metres: number
  /** Width in metres, normally 4,13. */
  width: number
  /** kg × 1000 ÷ (metres × width) */
  gsm: number
  location: string
  note: string
  status: keyof typeof ROLL_STATUS
  /** Set when the roll leaves stock ("Keluarkan"); the roll itself is kept. */
  issueDate: string
  destination: string
  /** Finished-goods production that consumed this roll (Phase 9.5). */
  usedIn?: string
}

/** Loom defaults ("settings"). */
export const LOOM_DEFAULTS = { width: 4.13, location: "Lamination/覆膜挺布", destination: "Laminasi" }

/** Journal sources. Only "manual" entries are made on the Jurnal umum page; the others come from their own pages. */
export const JOURNAL_SOURCES = {
  manual: "Manual",
  bca1: "Bank BCA1 PT",
  bca2: "Bank BCA2 NR",
  bca3: "Bank BCA3",
  purchase: "Purchase",
  sales: "Sales",
  gl: "General Ledger",
} as const
export type JournalSource = keyof typeof JOURNAL_SOURCES

/** Own bank accounts and their chart-of-accounts number. */
export const BANKS = [
  { id: "bca1", account: "101201", name: "BCA 1 PT" },
  { id: "bca2", account: "101202", name: "BCA 2 a.n. Nining Rahayu" },
  { id: "bca3", account: "101203", name: "BCA 3" },
] as const
export type BankId = (typeof BANKS)[number]["id"]

export type JournalLine = {
  /** Account number (Daftar akun). */
  account: string
  description: string
  descriptionZh: string
  /** "IDR" or a foreign currency; for foreign lines `amount` × `rate` = the Rupiah debit/credit. */
  currency: string
  amount: number | null
  rate: number | null
  /** Rupiah; a line has a debit or a credit, not both. */
  debit: number
  credit: number
  note: string
  /** Only set when an imported line's date differs from the entry's. */
  date?: string
}

/** General journal (Jurnal umum). Every money movement is one balanced entry. */
export const JOURNALS = "journals"
export type Journal = {
  id: string
  /** JV-0001/X/25 (manual), BBM.25.10.0001 / BBK.25.10.0001 (bank), or the original number when imported. */
  number: string
  /** YYYY-MM-DD */
  date: string
  source: JournalSource
  counterparty: string
  description: string
  lines: JournalLine[]
  totalDebit: number
  totalCredit: number
  /** Every account on the lines, for "entries touching account X" queries. */
  accounts: string[]
  /** False only for imported entries that didn't balance in Excel (flagged). */
  balanced: boolean
  /** Id of the entry this one reverses / the entry that reversed this one. */
  reverses?: string
  reversedBy?: string
  imported?: boolean
  /** The document that created this entry (purchase invoice, import, payment…). */
  document?: { type: "purchaseInvoice" | "importPurchase" | "supplierPayment" | "salesInvoice" | "customerReceipt" | "fgProduction" | "inventoryPosting"; id: string; number: string }
}

/** Closed accounting months: `accountingPeriods/{YYYY-MM}`; an Admin can reopen with a reason. */
export const ACCOUNTING_PERIODS = "accountingPeriods"
export type AccountingPeriod = {
  id: string
  status: "open" | "closed"
  closedBy?: { uid: string; email: string | null }
  closedAt?: Timestamp | null
  reopenedBy?: { uid: string; email: string | null }
  reopenedAt?: Timestamp | null
  reopenReason?: string
}

/** Monthly bank reconciliation: `bankRecs/{bank}-{YYYY-MM}`. */
export const BANK_RECS = "bankRecs"
export type BankRec = {
  id: string
  bank: BankId
  month: string
  /** Bank statement closing balance. */
  statementBalance: number | null
  /** "{journalId}:{lineIndex}" of lines ticked as cleared on the statement. */
  cleared: string[]
  /** Statement − (book balance adjusted for uncleared lines); 0 = reconciled. */
  difference: number
  reconciled: boolean
}

/** Accounts used by purchasing (from Daftar akun). */
export const PURCHASE_ACCOUNTS = {
  vatIn: "107001",
  pph22Prepaid: "107005",
  payableIdr: "211101",
  payableUsd: "211102",
  pph23Payable: "214003",
  pph42Payable: "214005",
} as const

export const WITHHOLDING = { none: "Tidak ada", pph23: "PPh 23", pph42: "PPh 4(2)" } as const
export type Withholding = keyof typeof WITHHOLDING

export const INVOICE_STATUS = { open: "Belum dibayar", partial: "Dibayar sebagian", paid: "Lunas" } as const
export type InvoiceStatus = keyof typeof INVOICE_STATUS

export type PurchaseLine = {
  /** Purchase item code, or "" for a free-text line. */
  item: string
  description: string
  /** Debit account (from the item's booking account, or chosen). */
  account: string
  qty: number
  unit: string
  price: number
  amount: number
}

/** Purchase invoice (Faktur pembelian, PI/…). Its journal is created with it; payments reduce `remaining`. */
export const PURCHASE_INVOICES = "purchaseInvoices"
export type PurchaseInvoice = {
  id: string
  /** PI/26J00001, or the original AP-… voucher when imported. */
  number: string
  /** Supplier code. */
  supplier: string
  supplierName: string
  supplierInvoiceNo: string
  /** YYYY-MM-DD; also the journal date. */
  date: string
  taxInvoiceNo: string
  taxInvoiceDate: string
  dueDate: string
  lines: PurchaseLine[]
  vatPct: number
  withholding: Withholding
  whtPct: number
  /** Sum of lines. */
  dpp: number
  ppn: number
  pph: number
  /** DPP + PPN − PPh. */
  payable: number
  /** 211101 (IDR) or 211102 (USD, imported). */
  payableAccount: string
  payments: { date: string; amount: number; paymentId: string; number: string }[]
  paid: number
  remaining: number
  status: InvoiceStatus
  journalId: string
  imported?: boolean
  /** Withheld PPh paid to the tax office (Daftar PPh dipotong). */
  whtPaid?: { date: string; proof: string }
  /** Weighing ↔ invoice matching (Phase 9.2). */
  weighings?: string[]
  invoicedKg?: number
  weighedKg?: number
  matchStatus?: "none" | "ok" | "pending" | "approved"
  matchApprovedBy?: { email: string | null }
}

/** Import purchase (Pembelian impor, PIB). */
export const IMPORT_PURCHASES = "importPurchases"
export type ImportPurchase = {
  id: string
  /** PIB/26J00001 */
  number: string
  pibDate: string
  nopen: string
  shipper: string
  seller: string
  invoiceNo: string
  invoiceDate: string
  containers: string
  containerCount: number | null
  goods: string
  term: string
  currency: string
  invoiceAmount: number
  customsValue: number
  rate: number
  customsValueRp: number
  duty: number
  pph22: number
  importVat: number
  totalTax: number
  ntpn: string
  /** Debit account for the goods (inventory or asset). */
  goodsAccount: string
  /** Credit account for the seller (normally 211102). */
  payableAccount: string
  /** Bank the import taxes were paid from. */
  bank: BankId
  /** Only when customs value ≠ invoice × rate: account for the difference (freight, insurance…). */
  differenceAccount: string
  journalId: string
}

/** Supplier payment (Pembayaran utang). Above the approval limit it waits for an Admin. */
export const SUPPLIER_PAYMENTS = "supplierPayments"
export const PAYMENT_STATUS = { pending: "Menunggu persetujuan", posted: "Diposting", rejected: "Ditolak" } as const
export type SupplierPayment = {
  id: string
  supplier: string
  supplierName: string
  date: string
  bank: BankId
  allocations: { invoice: string; number: string; amount: number }[]
  total: number
  status: keyof typeof PAYMENT_STATUS
  /** BBK number once posted. */
  number: string
  journalId: string
  requestedBy: { uid: string; email: string | null }
  approvedBy: { uid: string; email: string | null } | null
  rejectReason: string
}

/** Payments above this (Rp) need Admin approval before posting. */
export const PAYMENT_APPROVAL_LIMIT = 100_000_000

/** Accounts used by sales (from Daftar akun). */
export const SALES_ACCOUNTS = {
  receivable: "103101",
  receivableUsd: "103102",
  sales: "401001",
  vatOut: "214001",
  cogs: "510101",
  finishedGoods: "105301",
} as const

export type SalesLine = {
  /** Product code (Item penjualan), or "" for free text. */
  product: string
  description: string
  /** Rolls. */
  qty: number
  unit: string
  price: number
  amount: number
}

/** Sales invoice (Faktur penjualan, INV/…). */
export const SALES_INVOICES = "salesInvoices"
export type SalesInvoice = {
  id: string
  /** INV/26J00001 */
  number: string
  customer: string
  customerName: string
  date: string
  taxInvoiceNo: string
  dueDate: string
  lines: SalesLine[]
  vatPct: number
  dpp: number
  ppn: number
  total: number
  /** Values reported in the tax system (as in the Excel AR sheet). */
  dppRounded: number
  ppnEfaktur: number
  payments: { date: string; amount: number; paymentId: string; number: string }[]
  paid: number
  remaining: number
  status: InvoiceStatus
  journalId: string
  /** Cost of the rolls sold, posted to COGS (Phase 9.5). */
  cogs: number
}

/** Customer payment (Penerimaan piutang). */
export const CUSTOMER_RECEIPTS = "customerReceipts"
export type CustomerReceipt = {
  id: string
  /** BBM number. */
  number: string
  customer: string
  customerName: string
  date: string
  bank: BankId
  reference: string
  allocations: { invoice: string; number: string; amount: number }[]
  /** Sum of allocations (what leaves receivables). */
  allocated: number
  /** What arrived in the bank. */
  received: number
  /** allocated − received (bank charges, rounding), booked to `differenceAccount`. */
  difference: number
  differenceAccount: string
  journalId: string
}

/** VAT months marked "Dilaporkan" (reported): `vatPeriods/{YYYY-MM}`; VAT-relevant documents dated in them are locked. */
export const VAT_PERIODS = "vatPeriods"
export type VatPeriod = { id: string; reported: boolean; reportedBy: { email: string | null }; reportedAt: Timestamp | null }

/** Warehouse material (BB) ↔ purchase catalogue items (IA): `materialMaps/{BB code}` = { items }. */
export const MATERIAL_MAPS = "materialMaps"
export type MaterialMap = { id: string; items: string[] }

/** Allowed invoiced-vs-weighed difference before Admin approval (fraction, 0,5%). */
export const MATCH_TOLERANCE = 0.005

/** Finished-goods production (Barang jadi, FG/…): cloth rolls → product rolls. */
export const FG_PRODUCTIONS = "fgProductions"
export type FgProduction = {
  id: string
  number: string
  date: string
  product: string
  rolls: number
  /** Cloth roll numbers used (issued to lamination). */
  clothRolls: string[]
  clothKg: number
  costPerKg: number
  value: number
  journalId: string
}

/** Monthly posting of raw material used: `inventoryPostings/{YYYY-MM}`. */
export const INVENTORY_POSTINGS = "inventoryPostings"
export type InventoryPosting = { id: string; value: number; journalId: string; number: string }

/** Accounts for inventory and production. */
export const INVENTORY_ACCOUNTS = { rawMaterial: "105101", wip: "105201", finishedGoods: "105301", cogs: "510101" } as const
