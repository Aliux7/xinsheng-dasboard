import readXlsxFile from "read-excel-file/browser"
import writeXlsxFile from "write-excel-file/browser"

import { round2, VOUCHER_NUMBER, type BankTransaction } from "@/lib/bank-book"

/**
 * Buku bank import from the client's BANK BOOK workbook: one sheet per bank account (the user picks
 * which), title rows, an English header row (Date, Voucher/GL No., Name, Descriptions, Debet, Credit,
 * Balance, Remarks) with the Chinese one below it. Columns are found by their header, so a sheet with
 * another column order still reads.
 */

type Cell = string | number | boolean | Date | null

/**
 * The client's BANK BOOK sheet, columns A–L: rows 1–2 the account title, row 3 English headers,
 * row 4 Chinese headers, row 5 "Beginning Balance", then one row per transaction. `read` = the import
 * uses it; `required` = it must be filled. A (No.), B (month) and K are the client's own and not read.
 */
export const TEMPLATE_COLUMNS = [
  { col: "A", en: "", zh: "", read: false, example: "2" },
  { col: "B", en: "", zh: "", read: false, example: "2026-01" },
  { col: "C", en: "Date", zh: "日期", read: true, required: true, example: "07/01/2026" },
  { col: "D", en: "Voucher/GL No.", zh: "总账号", read: true, example: "BBK.26.01.0001" },
  { col: "E", en: "Name", zh: "名字", read: true, example: "ANTONI" },
  { col: "F", en: "Descriptions", zh: "描写", read: true, required: true, example: "Beli keperluan Mess" },
  { col: "G", en: "", zh: "", read: true, example: "买宿舍用品" },
  { col: "H", en: "Debet", zh: "收方", read: true, required: true, example: "" },
  { col: "I", en: "Credit", zh: "付方", read: true, required: true, example: "10.837.504" },
  { col: "J", en: "Balance", zh: "结存", read: true, example: "489.537.607,23" },
  { col: "K", en: "", zh: "", read: false, example: "" },
  { col: "L", en: "Remarks", zh: "", read: true, example: "" },
] as const

/** Rows 1–6 of the template for `bank`: title, headers, Beginning Balance and one example row. */
export function templateRows(bank: { name: string; accountNo: string }) {
  const at = (values: Partial<Record<string, string>>) => TEMPLATE_COLUMNS.map((c) => values[c.col] ?? "")
  return [
    at({ C: `NAMA REK A/C  NO. : ${bank.accountNo}` }),
    at({ C: bank.name }),
    TEMPLATE_COLUMNS.map((c) => c.en),
    TEMPLATE_COLUMNS.map((c) => c.zh),
    at({ A: "1", B: "2026-01", C: "01/01/2026", F: "Beginning Balance  上个月", J: "500.375.112,23" }),
    TEMPLATE_COLUMNS.map((c) => c.example),
  ]
}

/** An empty BANK BOOK sheet for `bank` (rows 1–5, Beginning Balance without amount), named after the bank. */
export async function downloadTemplate(bank: { name: string; accountNo: string }) {
  const rows = templateRows(bank).slice(0, 5)
  rows[4] = rows[4].map((v, i) => (TEMPLATE_COLUMNS[i].col === "F" ? v : ""))
  await writeXlsxFile(
    rows.map((r, i) => r.map((value) => (value ? { value, fontWeight: i >= 2 && i <= 3 ? ("bold" as const) : undefined } : null))),
    { sheet: bank.name.slice(0, 31), columns: TEMPLATE_COLUMNS.map((c) => ({ width: c.col === "F" ? 40 : c.col === "C" || c.col === "D" ? 16 : 12 })) }
  ).toFile(`template-buku-bank-${bank.name.replace(/[^\w-]+/g, "-")}.xlsx`)
}

export type BookSheet = { name: string; cells: Cell[][] }

export type BookRow = {
  /** Excel row number. */
  row: number
  /** Voucher/GL No. as written ("" when empty). */
  voucher: string
  date: string
  name: string
  description: string
  descriptionZh: string
  remarks: string
  /** Debet − Credit: positive = money in, negative = out (e.g. PPh withheld on a payment). */
  amount: number
  /** Why the row can't be saved as it is. */
  error?: string
  /** Saved, but worth a look (e.g. the sheet's balance doesn't follow). */
  warnings: string[]
}

export type BookVoucher = {
  key: string
  /** Number it keeps; "" = numbered automatically. */
  number: string
  date: string
  rows: BookRow[]
  net: number
  error?: string
  warnings: string[]
  /** Probably in the book already. */
  duplicate?: string
}

export type ParsedBook = {
  vouchers: BookVoucher[]
  /** First "Beginning Balance" of the sheet. */
  opening: { row: number; date: string; balance: number } | null
  /** Rows left out (no amount), with why. */
  skipped: { row: number; reason: string }[]
}

const pad = (n: number) => String(n).padStart(2, "0")
const text = (c: Cell | undefined) => (c == null ? "" : c instanceof Date ? c.toISOString() : String(c).trim())
const fmt = (n: number) => n.toLocaleString("id-ID", { maximumFractionDigits: 2 })

function dateOf(c: Cell | undefined) {
  if (c instanceof Date) return `${c.getUTCFullYear()}-${pad(c.getUTCMonth() + 1)}-${pad(c.getUTCDate())}`
  const t = text(c)
  const iso = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (iso) return `${iso[1]}-${pad(+iso[2])}-${pad(+iso[3])}`
  const dmy = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/)
  if (dmy) return `${dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3]}-${pad(+dmy[2])}-${pad(+dmy[1])}`
  return ""
}

/** 1500000, "1.500.000,00", "1,500,000.00", "15.000" (id-ID thousands) → number; blank → 0. */
export function amountOf(c: Cell | undefined) {
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

/** Every sheet of the workbook; the user then picks one. */
export async function readBook(file: File): Promise<BookSheet[]> {
  return (await readXlsxFile(file)).map((s) => ({ name: s.sheet, cells: s.data as Cell[][] }))
}

/** True when the sheet's title rows mention `needle` (e.g. the bank's account number). */
export const sheetMentions = (sheet: BookSheet, needle: string) =>
  !!needle && sheet.cells.slice(0, 3).some((r) => r.some((c) => text(c).replace(/\s/g, "").includes(needle.replace(/\s/g, ""))))

type Layout = Record<"date" | "voucher" | "name" | "description" | "descriptionZh" | "debit" | "credit" | "balance" | "remarks", number> & {
  /** 0-based index of the first data row. */
  first: number
}

/** Finds the header row (Date … Debet … Credit) and each column by its English or Chinese header. */
function layoutOf(cells: Cell[][]): Layout | null {
  for (let r = 0; r < Math.min(cells.length, 15); r++) {
    const head = (cells[r] ?? []).map((c) => text(c).toLowerCase())
    const at = (row: string[], names: string[]) => row.findIndex((v) => names.some((n) => v.startsWith(n)))
    const date = at(head, ["date", "tanggal"])
    const debit = at(head, ["debet", "debit"])
    const credit = at(head, ["credit", "kredit"])
    if (date < 0 || debit < 0 || credit < 0) continue
    const below = (cells[r + 1] ?? []).map((c) => text(c).toLowerCase())
    const find = (...names: string[]) => {
      const i = at(head, names)
      return i >= 0 ? i : at(below, names)
    }
    const description = find("description", "keterangan", "描写")
    // The Chinese description has no English header: the empty column right after Descriptions.
    const descriptionZh = description >= 0 && description + 1 < debit && !head[description + 1] ? description + 1 : -1
    return {
      first: r + (below.some((v) => /[一-鿿]/.test(v)) ? 2 : 1),
      date,
      voucher: find("voucher", "g/l", "总账号"),
      name: find("name", "nama", "名字"),
      description,
      descriptionZh,
      debit,
      credit,
      balance: find("balance", "saldo", "结存"),
      remarks: find("remarks", "catatan"),
    }
  }
  return null
}

/** True when the sheet has the BANK BOOK headers (Date, Debet, Credit). */
export const isBankBook = (sheet: BookSheet) => !!layoutOf(sheet.cells)

/**
 * Reads one bank-book sheet into vouchers. `book` = this bank's rows already saved: a voucher whose
 * number is in it is refused, one without a usable number is flagged when a voucher with the same
 * date and amount exists. Returns null when the sheet isn't a bank book.
 */
export function buildBook(cells: Cell[][], book: BankTransaction[]): ParsedBook | null {
  const at = layoutOf(cells)
  if (!at) return null
  const get = (c: Cell[], i: number) => (i >= 0 ? c[i] : null)

  let opening: ParsedBook["opening"] = null
  let running: number | null = null
  const rows: BookRow[] = []
  const skipped: ParsedBook["skipped"] = []
  cells.slice(at.first).forEach((c, i) => {
    const row = at.first + i + 1
    const description = text(get(c, at.description))
    const balance = at.balance >= 0 && typeof c[at.balance] === "number" ? (c[at.balance] as number) : null
    // Marker rows can carry their text in any column (Name, Descriptions…).
    const marker = (re: RegExp) => c.some((v) => typeof v === "string" && re.test(v.trim()))
    if (marker(/^beginning\s*balance/i)) {
      if (!opening && balance !== null) opening = { row, date: dateOf(get(c, at.date)), balance }
      running = balance
      return
    }
    if (marker(/^(sub\s*total|total)$/i)) return
    const debit = amountOf(get(c, at.debit))
    const credit = amountOf(get(c, at.credit))
    const date = dateOf(get(c, at.date))
    // Numbered but empty template rows, notes such as "TUTUP REKENING", repeated headers.
    if (!debit && !credit && !date) return
    if (!Number.isNaN(debit) && !Number.isNaN(credit) && !debit && !credit) {
      skipped.push({ row, reason: `Debet dan Credit kosong${description ? ` (${description})` : ""}.` })
      return
    }
    const r: BookRow = {
      row,
      voucher: text(get(c, at.voucher)).toUpperCase(),
      date,
      name: text(get(c, at.name)),
      description,
      descriptionZh: text(get(c, at.descriptionZh)),
      remarks: text(get(c, at.remarks)),
      amount: round2((debit || 0) - (credit || 0)),
      warnings: [],
    }
    if (!date) r.error = "Tanggal tidak dikenali."
    else if (Number.isNaN(debit) || Number.isNaN(credit)) r.error = "Debet/Credit bukan angka."
    else if (!description && !r.name) r.error = "Name dan Descriptions kosong."
    if (debit && credit) r.warnings.push(`Debet dan Credit sama-sama terisi; dipakai selisihnya (${fmt(r.amount)}).`)
    // The sheet's running balance should follow; resync after a mismatch so one error is reported once.
    if (running !== null && !r.error) {
      running = round2(running + r.amount)
      if (balance !== null && Math.abs(balance - running) >= 0.01) {
        r.warnings.push(`Balance di sheet ${fmt(balance)}, seharusnya ${fmt(running)}.`)
        running = balance
      }
    }
    rows.push(r)
  })

  const used = new Set(book.map((r) => r.number.toUpperCase()).filter(Boolean))
  // Net per saved voucher, counted by date and amount.
  const nets = new Map<string, { date: string; net: number }>()
  for (const r of book) {
    const k = `${r.date}|${r.number || r.id}`
    nets.set(k, { date: r.date, net: round2((nets.get(k)?.net ?? 0) + r.amount) })
  }
  const counts = new Map<string, number>()
  for (const { date, net } of nets.values()) counts.set(`${date}|${net}`, (counts.get(`${date}|${net}`) ?? 0) + 1)

  // Consecutive rows with the same number are one voucher. The client reuses numbers for later,
  // unrelated rows (copied month-end bank fees…): those get an automatic number instead.
  const groups: { number: string; rows: BookRow[] }[] = []
  for (const r of rows) {
    const number = VOUCHER_NUMBER.test(r.voucher) ? r.voucher.replace(/\s+/g, "") : ""
    const last = groups.at(-1)
    if (number && last?.number === number && last.rows.at(-1)!.voucher.replace(/\s+/g, "") === number) last.rows.push(r)
    else groups.push({ number, rows: [r] })
  }

  const firstRow = new Map<string, number>()
  const vouchers = groups.map(({ number: written, rows: rs }): BookVoucher => {
    const reused = !!written && firstRow.has(written)
    if (written && !reused) firstRow.set(written, rs[0].row)
    const number = reused ? "" : written
    const date = rs.find((r) => r.date)?.date ?? ""
    const net = round2(rs.reduce((s, r) => s + r.amount, 0))
    const v: BookVoucher = { key: `row-${rs[0].row}`, number, date, rows: rs, net, warnings: [] }
    const m = number.match(VOUCHER_NUMBER)
    if (reused) v.warnings.push(`Nomor ${written} sudah dipakai di baris ${firstRow.get(written)}; nomor dibuat otomatis.`)
    else if (!number) v.warnings.push(rs[0].voucher ? `"${rs[0].voucher}" bukan nomor BBM/BBK; nomor dibuat otomatis.` : "Tanpa Voucher/GL No.; nomor dibuat otomatis.")
    if (rs.some((r) => r.error)) v.error = "Ada baris yang belum benar."
    else if (!net) v.error = "Jumlah bersih voucher 0."
    else if (m && used.has(number)) v.error = `Nomor ${number} sudah ada di buku bank ini.`
    if (m && (m[1].toUpperCase() === "M") !== net > 0) v.warnings.push(`Nomor ${m[1].toUpperCase() === "M" ? "BBM (masuk)" : "BBK (keluar)"} tapi uang ${net > 0 ? "masuk" : "keluar"}.`)
    if (m && date && date.slice(2, 7) !== `${m[2]}-${m[3]}`) v.warnings.push(`Bulan di nomor (${m[3]}/${m[2]}) beda dengan tanggal.`)
    if (!v.error && !m) {
      // Each saved voucher can only explain one voucher of the sheet.
      const k = `${date}|${net}`
      const left = counts.get(k) ?? 0
      if (left > 0) {
        v.duplicate = "Sudah ada transaksi dengan tanggal dan jumlah yang sama."
        counts.set(k, left - 1)
      }
    }
    return v
  })
  return { vouchers, opening, skipped }
}
