import type { StockLine } from "@/lib/account-links"
import { addRecord, transaction, type Writer } from "@/lib/db"

/**
 * Buku bank: money in and out of the company's own bank accounts, typed or imported from the client's
 * BANK BOOK workbook. Rows sharing a voucher number (BBM/BBK.YY.MM.NNNN) form one voucher, journaled in
 * Jurnal buku bank (`lib/journal.ts`); a journaled row is locked until its journal is cancelled.
 */

/** Own bank accounts: `banks/{auto id}`; the id is what rows and BBM/BBK counters point at. */
export const BANKS = "banks"
export type Bank = {
  id: string
  name: string
  accountNo: string
  /** Its account in Daftar akun (e.g. 101201), the bank side of its journals. */
  accountCode?: string
  active: boolean
}

/** "BCA PT (5060552098)"; banks saved by the older version have no `accountNo`. */
export const bankLabel = (b: Pick<Bank, "name" | "accountNo">) => (b.accountNo ? `${b.name} (${b.accountNo})` : b.name)

export const BANK_TRANSACTIONS = "bankTransactions"
export type BankTransaction = {
  id: string
  /** Bank id (`banks`). */
  bank: string
  /** YYYY-MM-DD */
  date: string
  /** BBM/BBK.YY.MM.NNNN; "" for an opening balance. */
  number: string
  name: string
  description: string
  descriptionZh: string
  note: string
  /** Rupiah: positive = money in (Debet), negative = out (Credit). */
  amount: number
  /** The bank's Beginning Balance from an import. */
  opening: boolean
  /** Where it came from: typed, or the import's file / sheet / Excel row. */
  origin: { kind: "manual" } | { kind: "import"; file: string; sheet: string; row: number }
  /** Contra account chosen in Jurnal buku bank (kept after a journal is cancelled). */
  contra?: string
  /** Journal id once journaled; the row is locked while set. */
  journal?: string | null
  /** Items and quantities when the contra is an inventory-linked account (`lib/account-links.ts`). */
  stock?: StockLine[]
}

export type NewBankRow = Omit<BankTransaction, "id" | "bank" | "number" | "contra" | "journal" | "stock">

const locked = (row: BankTransaction) => {
  if (row.journal) throw new Error(`${row.number} sudah dijurnal. Batalkan jurnalnya dulu di Jurnal buku bank.`)
}

/** BBK.26.01.0001, sometimes with a letter as the client writes it (BBK.26.06.0019A). */
export const VOUCHER_NUMBER = /^BB([MK])\.(\d{2})\.(\d{2})\.(\d{4})\s*[A-Z]?$/i

const pad4 = (n: number) => String(n).padStart(4, "0")
export const round2 = (n: number) => Math.round(n * 100) / 100

/** Next BBM (in) / BBK (out) number of a bank for the month of `date`: counter `counters/{BBM|BBK}-{bank}-YYYY-MM`. */
async function nextNumber(w: Writer, bank: string, kind: "BBM" | "BBK", date: string) {
  const [y, m] = date.split("-")
  const id = `${kind}-${bank}-${y}-${m}`
  const last = (await w.get<{ last: number }>("counters", id))?.last ?? 0
  await w.set("counters", id, { last: last + 1 }, { silent: true })
  return `${kind}.${y.slice(2)}.${m}.${pad4(last + 1)}`
}

/** Moves the counter past a number taken from the sheet, so new numbers don't repeat it. */
async function claimNumber(w: Writer, bank: string, number: string) {
  const m = number.match(VOUCHER_NUMBER)
  if (!m) return
  const id = `BB${m[1].toUpperCase()}-${bank}-20${m[2]}-${m[3]}`
  const last = (await w.get<{ last: number }>("counters", id))?.last ?? 0
  if (Number(m[4]) > last) await w.set("counters", id, { last: Number(m[4]) }, { silent: true })
}

async function ensureBank(w: Writer, id: string) {
  const bank = await w.get<Bank>(BANKS, id)
  if (!bank) throw new Error("Rekening bank tidak ditemukan.")
  if (!bank.active) throw new Error(`Bank ${bank.name} tidak aktif.`)
}

export function addBank(bank: Omit<Bank, "id">) {
  return addRecord(BANKS, bank)
}

/** Typed on the page; gets the next BBM/BBK number. Returns the number. */
export function saveBankRow(bank: string, row: Pick<BankTransaction, "date" | "name" | "description" | "amount">) {
  if (!row.amount) throw new Error("Jumlah tidak boleh 0.")
  return transaction(async (w) => {
    await ensureBank(w, bank)
    const number = await nextNumber(w, bank, row.amount > 0 ? "BBM" : "BBK", row.date)
    const data: Omit<BankTransaction, "id"> = { ...row, bank, number, descriptionZh: "", note: "", opening: false, origin: { kind: "manual" } }
    await w.set(BANK_TRANSACTIONS, w.newId(BANK_TRANSACTIONS), data)
    return number
  })
}

/**
 * Imported vouchers: each group shares one number, the sheet's (counter moved past it) or the next
 * BBM/BBK when "". An opening balance keeps "". Pass groups with sheet numbers first, so automatic
 * numbers continue after them.
 */
export function saveBankRows(bank: string, groups: { number: string; rows: NewBankRow[] }[]) {
  return transaction(async (w) => {
    await ensureBank(w, bank)
    let saved = 0
    for (const g of groups) {
      const net = round2(g.rows.reduce((s, r) => s + r.amount, 0))
      let number = g.number
      if (number) await claimNumber(w, bank, number)
      else if (!g.rows.every((r) => r.opening)) number = await nextNumber(w, bank, net > 0 ? "BBM" : "BBK", g.rows[0].date)
      for (const r of g.rows) {
        await w.set(BANK_TRANSACTIONS, w.newId(BANK_TRANSACTIONS), { ...r, bank, number })
        saved++
      }
    }
    return saved
  })
}

export type BankRowPatch = Partial<Pick<BankTransaction, "date" | "name" | "description" | "descriptionZh" | "note" | "amount">>

/** Edits a row (its number stays). */
export function updateBankRow(id: string, patch: BankRowPatch) {
  if (patch.amount !== undefined && !patch.amount) throw new Error("Jumlah tidak boleh 0.")
  return transaction(async (w) => {
    const row = await w.get<BankTransaction>(BANK_TRANSACTIONS, id)
    if (!row) throw new Error("Baris buku bank tidak ditemukan.")
    locked(row)
    await w.update(BANK_TRANSACTIONS, id, patch)
    return row.number
  })
}

export function deleteBankRow(id: string) {
  return transaction(async (w) => {
    const row = await w.get<BankTransaction>(BANK_TRANSACTIONS, id)
    if (!row) throw new Error("Baris buku bank tidak ditemukan.")
    locked(row)
    await w.remove(BANK_TRANSACTIONS, id)
    return row.number
  })
}

/** Oldest first: date, opening balance first, number, then the sheet's row order. */
export function sortBook(rows: BankTransaction[]) {
  const sheetRow = (r: BankTransaction) => (r.origin.kind === "import" ? r.origin.row : 0)
  return [...rows].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      Number(b.opening) - Number(a.opening) ||
      a.number.localeCompare(b.number, undefined, { numeric: true }) ||
      sheetRow(a) - sheetRow(b)
  )
}
