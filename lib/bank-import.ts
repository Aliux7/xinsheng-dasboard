import { readSheet } from "read-excel-file/browser"

import { PURCHASE_ACCOUNTS, SALES_ACCOUNTS, type Journal } from "@/lib/collections"
import type { TemplateSheet } from "@/lib/excel-template"
import { linesOf, round2 } from "@/lib/journal"

/**
 * Bank statement (mutasi rekening) import on the Buku bank page: each row becomes one BBM/BBK entry
 * through `saveBankEntry`, bank vs the row's contra account. Rows paying invoices are refused (they
 * belong on Penerimaan pelanggan / Pembayaran pemasok so the invoice's remaining goes down).
 */
export const BANK_TEMPLATE: TemplateSheet[] = [
  {
    name: "MUTASI",
    headerRow: 1,
    note: "Sheet pertama yang dibaca. Isi Masuk atau Keluar (tidak keduanya). Tanggal: tanggal Excel, 2026-11-03 atau 03/11/2026. Akun lawan boleh kosong dan dipilih di pratinjau.",
    columns: [
      { col: "A", header: "Tanggal", required: true, example: "03/11/2026" },
      { col: "B", header: "Keterangan", required: true, example: "BIAYA ADM" },
      { col: "C", header: "Masuk", required: true, example: "" },
      { col: "D", header: "Keluar", required: true, example: "15000" },
      { col: "E", header: "Akun lawan", example: "610101" },
      { col: "F", header: "Nama", example: "BCA" },
      { col: "G", header: "Referensi", example: "TRX123" },
    ],
  },
]

/** Accounts settled through invoices: an entry straight to them would leave the invoice open. */
export const INVOICE_ACCOUNTS: Record<string, string> = {
  [SALES_ACCOUNTS.receivable]: "Penerimaan pelanggan",
  [SALES_ACCOUNTS.receivableUsd]: "Penerimaan pelanggan",
  [PURCHASE_ACCOUNTS.payableIdr]: "Pembayaran pemasok",
  [PURCHASE_ACCOUNTS.payableUsd]: "Pembayaran pemasok",
}

/** Why `contra` can't be used for an imported row, or null. */
export function contraError(contra: string, accountCodes: Set<string>) {
  if (!contra) return "Pilih akun lawan."
  if (!accountCodes.has(contra)) return `Akun ${contra} tidak ada di Daftar akun.`
  if (INVOICE_ACCOUNTS[contra]) return `Akun ${contra} dicatat lewat ${INVOICE_ACCOUNTS[contra]}, supaya sisa faktur ikut berkurang.`
  return null
}

type Cell = string | number | boolean | Date | null

export type StatementRow = {
  /** Excel row number. */
  row: number
  date: string
  description: string
  name: string
  reference: string
  direction: "in" | "out"
  amount: number
  contra: string
  /** Why the row can't be saved as it is (the contra account is checked separately: `contraError`). */
  error?: string
  /** An entry on this bank with the same date, direction and amount already exists. */
  duplicate?: string
}

const pad = (n: number) => String(n).padStart(2, "0")
const text = (c: Cell) => (c == null ? "" : c instanceof Date ? c.toISOString() : String(c).trim())

function dateOf(c: Cell) {
  if (c instanceof Date) return `${c.getUTCFullYear()}-${pad(c.getUTCMonth() + 1)}-${pad(c.getUTCDate())}`
  const t = text(c)
  const iso = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (iso) return `${iso[1]}-${pad(+iso[2])}-${pad(+iso[3])}`
  const dmy = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/)
  if (dmy) return `${dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3]}-${pad(+dmy[2])}-${pad(+dmy[1])}`
  return ""
}

/** 1500000, "1.500.000,00", "1,500,000.00", "15.000" (id-ID thousands) → number; blank → 0. */
function amountOf(c: Cell) {
  if (typeof c === "number") return c
  let t = text(c).replace(/[^\d.,-]/g, "")
  if (!t) return 0
  const lastDot = t.lastIndexOf(".")
  const lastComma = t.lastIndexOf(",")
  if (lastComma > lastDot) t = t.replace(/\./g, "").replace(",", ".")
  else if (lastDot > lastComma && lastComma >= 0) t = t.replace(/,/g, "")
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "")
  else if (/^\d{1,3}(,\d{3})+$/.test(t)) t = t.replace(/,/g, "")
  else t = t.replace(",", ".")
  const n = Number(t)
  return Number.isNaN(n) ? NaN : n
}

export async function readStatement(file: File) {
  return (await readSheet(file)) as Cell[][]
}

/** Reads rows below the header, checks them, and marks likely duplicates of entries already in the book. */
export function buildStatement(cells: Cell[][], bankAccount: string, journals: Journal[]): StatementRow[] {
  const existing = linesOf(journals, bankAccount).map((l) => `${l.date}|${l.line.debit ? "in" : "out"}|${round2(l.line.debit || l.line.credit)}`)
  const counts = new Map<string, number>()
  for (const k of existing) counts.set(k, (counts.get(k) ?? 0) + 1)

  const rows: StatementRow[] = []
  cells.slice(1).forEach((c, i) => {
    if (!c.some((v) => text(v))) return
    const date = dateOf(c[0])
    const masuk = amountOf(c[2])
    const keluar = amountOf(c[3])
    const contra = text(c[4])
    const row: StatementRow = {
      row: i + 2,
      date,
      description: text(c[1]),
      name: text(c[5]),
      reference: text(c[6]),
      direction: masuk ? "in" : "out",
      amount: round2(Math.abs(masuk || keluar)),
      contra,
    }
    if (!date) row.error = "Tanggal tidak dikenali."
    else if (Number.isNaN(masuk) || Number.isNaN(keluar)) row.error = "Jumlah bukan angka."
    else if (masuk && keluar) row.error = "Isi Masuk atau Keluar, tidak keduanya."
    else if (!masuk && !keluar) row.error = "Masuk dan Keluar kosong."
    else if (!row.description) row.error = "Keterangan kosong."
    // Each existing entry can only explain one statement row.
    const key = `${row.date}|${row.direction}|${row.amount}`
    const left = counts.get(key) ?? 0
    if (!row.error && left > 0) {
      row.duplicate = "Sudah ada transaksi dengan tanggal dan jumlah yang sama."
      counts.set(key, left - 1)
    }
    rows.push(row)
  })
  return rows
}
