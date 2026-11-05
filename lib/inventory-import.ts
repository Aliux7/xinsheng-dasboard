import readXlsxFile from "read-excel-file/browser"
import writeXlsxFile from "write-excel-file/browser"

import { amountOf } from "@/lib/bank-import"
import { transaction } from "@/lib/db"
import { formatNumber } from "@/lib/utils"
import type { Account } from "@/lib/accounts"
import type { Department } from "@/lib/departments"
import { INVENTORY_ITEMS, INVENTORY_MOVEMENTS, ITEM_CODE, claimCode, cleanCode, move, round3, type InventoryItem } from "@/lib/inventory"

/**
 * Stok bahan baku import: one item per row, A code, B name, C unit, D group, E opening stock, F department
 * (code or name, optional), G opening value (Rp, needed with an opening stock), H inventory account (an
 * account linked to inventory, optional); an optional header row on top. Items are matched by code, then by name (an item without a code gets the file's).
 * New items are added with the opening stock as a "Stok awal" movement; existing ones only get name, unit
 * and group (and a missing code), their stock is left to movements.
 */

type Cell = string | number | boolean | Date | null

export type ItemSheet = { name: string; cells: Cell[][] }

export const ITEM_COLUMNS = [
  { col: "A", label: "Kode bahan baku", required: true, example: "BB001" },
  { col: "B", label: "Nama bahan baku", required: true, example: "Benang PP putih" },
  { col: "C", label: "Satuan", required: true, example: "kg" },
  { col: "D", label: "Grup", required: false, example: "Benang" },
  { col: "E", label: "Stok awal", required: false, example: "1250,5" },
  { col: "F", label: "Departemen", required: false, example: "LOOM" },
  { col: "G", label: "Nilai stok awal (Rp)", required: false, example: "25.006.000" },
  { col: "H", label: "Akun persediaan", required: false, example: "105101" },
] as const

export type ItemRow = {
  /** Excel row number. */
  row: number
  code: string
  name: string
  unit: string
  group: string
  /** Department code; "" = none. */
  department: string
  /** Inventory account code; "" = not chosen. */
  account: string
  opening: number
  openingValue: number
  /** The matching saved item. */
  existing?: string
  /** Its code before this import ("" when it had none). */
  previousCode?: string
  status: "new" | "update" | "same"
  changes: string[]
  error?: string
  warnings: string[]
}

const text = (c: Cell | undefined) => (c == null ? "" : String(c).replace(/\s+/g, " ").trim())
const key = (name: string) => name.trim().toLowerCase()

export async function readItems(file: File): Promise<ItemSheet[]> {
  return (await readXlsxFile(file)).map((s) => ({ name: s.sheet, cells: s.data as Cell[][] }))
}

export function buildItems(cells: Cell[][], items: InventoryItem[], departments: Department[], stockAccounts: Account[]): ItemRow[] {
  const stockAccount = new Set(stockAccounts.map((a) => a.code))
  const departmentOf = new Map(departments.flatMap((d) => [[d.code.toLowerCase(), d.code], [key(d.name), d.code]] as [string, string][]))
  const byCode = new Map(items.filter((i) => i.code).map((i) => [i.code!, i]))
  const byName = new Map(items.map((i) => [key(i.name), i]))
  const seenCode = new Map<string, number>()
  const seenName = new Map<string, number>()
  const rows: ItemRow[] = []
  cells.forEach((r, i) => {
    const [code, name, unit, group, dept, acct] = [cleanCode(text(r[0])), text(r[1]), text(r[2]), text(r[3]), text(r[5]), text(r[7])]
    if (!code && !name && !unit && !group && text(r[4]) === "" && !dept && !acct) return
    // A header row: "Kode bahan baku | Nama bahan baku | …".
    if (i < 3 && /^KODE/.test(code) && /^nama/i.test(name)) return
    const row = i + 1
    const opening = text(r[4]) === "" ? 0 : amountOf(r[4])
    const openingValue = text(r[6]) === "" ? 0 : amountOf(r[6])
    const named = byName.get(key(name))
    // By code; else an item of the same name that has no code yet.
    const old = byCode.get(code) ?? (named && !named.code ? named : undefined)
    const warnings: string[] = []
    let error: string | undefined
    if (!code) error = "Kode bahan baku kosong"
    else if (!ITEM_CODE.test(code)) error = `Kode "${code}" hanya boleh huruf, angka, titik, garis bawah dan strip`
    else if (seenCode.has(code)) error = `Kode sama dengan baris ${seenCode.get(code)}`
    else if (!name) error = "Nama bahan baku kosong"
    else if (seenName.has(key(name))) error = `Nama sama dengan baris ${seenName.get(key(name))}`
    else if (named && named.id !== old?.id) error = `Nama sudah dipakai bahan baku ${named.code ?? ""} ${named.name}`.replace("  ", " ")
    else if (!unit && !old) error = "Satuan kosong"
    else if (Number.isNaN(opening) || opening < 0) error = `Stok awal "${text(r[4])}" bukan angka ≥ 0`
    else if (dept && !departmentOf.has(key(dept))) error = `Departemen "${dept}" tidak ada di halaman Departemen`
    else if (acct && !stockAccount.has(acct)) error = `Akun ${acct} tidak terhubung ke inventory di Daftar akun`
    else if (!old && opening > 0 && !(openingValue > 0)) error = "Stok awal perlu Nilai stok awal (kolom G)"
    else if (Number.isNaN(openingValue) || openingValue < 0) error = `Nilai stok awal "${text(r[6])}" bukan angka ≥ 0`
    if (code && !seenCode.has(code)) seenCode.set(code, row)
    if (name && !seenName.has(key(name))) seenName.set(key(name), row)
    if (old && opening) warnings.push(`Stok awal diabaikan: bahan baku sudah ada (stok ${formatNumber(old.stock)} ${old.unit}); pakai Stok masuk / keluar`)
    if (old && unit && unit !== old.unit && old.stock) warnings.push(`Satuan berubah ${old.unit} → ${unit}, padahal stoknya ${formatNumber(old.stock)} ${old.unit}`)
    if (old && !old.active) warnings.push("Bahan baku ini nonaktif")

    // An empty department cell keeps the saved one.
    const department = dept ? (departmentOf.get(key(dept)) ?? "") : (old?.department ?? "")
    const next = { code, name: name || old?.name || "", unit: unit || old?.unit || "", group: group || old?.group || "", department, account: acct || old?.account || "" }
    const labels = { code: "kode", name: "nama", unit: "satuan", group: "grup", department: "departemen", account: "akun persediaan" } as const
    const changes = old ? (Object.keys(next) as (keyof typeof next)[]).filter((k) => (old[k] ?? "") !== next[k]).map((k) => labels[k]) : []
    rows.push({
      row,
      ...next,
      opening: old || Number.isNaN(opening) ? 0 : round3(opening),
      openingValue: old || Number.isNaN(openingValue) ? 0 : Math.round(openingValue * 100) / 100,
      existing: old?.id,
      previousCode: old?.code ?? "",
      status: !old ? "new" : changes.length ? "update" : "same",
      changes,
      error,
      warnings,
    })
  })
  return rows
}

/** Rows per transaction: a new item with stock is 4 documents (code, item, movement, stock) + 3 log entries. */
export const ITEM_CHUNK = 60

/** New items (with their opening stock movement) and code/name/unit/group of existing ones, all in one transaction. */
export function saveItems(rows: ItemRow[], openingDate: string) {
  return transaction(async (w) => {
    const batch = w.newId(INVENTORY_MOVEMENTS)
    for (const r of rows) {
      const data = { code: r.code, name: r.name, unit: r.unit, group: r.group, department: r.department, account: r.account }
      if (r.existing) {
        await claimCode(w, r.code, r.existing, r.previousCode || undefined)
        await w.update(INVENTORY_ITEMS, r.existing, data)
        continue
      }
      const id = w.newId(INVENTORY_ITEMS)
      await claimCode(w, r.code, id)
      await w.set(INVENTORY_ITEMS, id, { ...data, stock: 0, active: true })
      if (r.opening) await move(w, { item: id, in: r.opening, out: 0, value: r.openingValue }, { date: openingDate, note: "Stok awal (import)", batch })
    }
    return rows.length
  })
}

/** Header row plus one example row. */
export async function downloadItemTemplate() {
  await writeXlsxFile(
    [
      ITEM_COLUMNS.map((c) => ({ value: c.label, fontWeight: "bold" as const })),
      ITEM_COLUMNS.map((c) => (c.col === "E" ? { value: 1250.5 } : c.col === "G" ? { value: 25006000 } : { value: c.example })),
    ],
    { sheet: "STOK", columns: [{ width: 14 }, { width: 35 }, { width: 10 }, { width: 20 }, { width: 12 }, { width: 16 }, { width: 18 }, { width: 16 }] }
  ).toFile("template-stok-bahan-baku.xlsx")
}
