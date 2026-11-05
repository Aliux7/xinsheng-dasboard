import { auth } from "@/lib/firebase"
import { transaction, type Writer } from "@/lib/db"
import { formatNumber } from "@/lib/utils"

/**
 * Inventory: items in `inventoryItems/{auto id}` with their live `stock`, and every change of it in
 * `inventoryMovements` (in and/or out, date, note). Stock only changes through `saveMovements`, which
 * writes the movement and the new stock in one transaction and never lets stock go below zero.
 * Movements are never edited or deleted; a mistake is fixed with an opposite movement.
 * Item codes are unique: `inventoryCodes/{code}` = { item } reserves each one.
 */
export const INVENTORY_ITEMS = "inventoryItems"
export const INVENTORY_MOVEMENTS = "inventoryMovements"
const INVENTORY_CODES = "inventoryCodes"

export type InventoryItem = {
  id: string
  /** Item code, unique, e.g. BB001; items added before codes existed have none until edited. */
  code?: string
  name: string
  /** kg, roll, pcs… */
  unit: string
  /** Optional heading, e.g. Benang. */
  group: string
  /** Optional department code (`departments`); "" or missing = none. */
  department?: string
  /** Its inventory account (linked to inventory in Daftar akun, e.g. 105101); needed for HPP bulanan. */
  account?: string
  stock: number
  active: boolean
}

export type InventoryMovement = {
  id: string
  item: string
  /** Copied so the history reads without the item list. */
  itemCode?: string
  itemName: string
  unit: string
  /** YYYY-MM-DD */
  date: string
  in: number
  out: number
  /** Stock of the item right after this movement was saved. */
  stockAfter: number
  note: string
  /** Movements saved together share it. */
  batch: string
  by: { uid: string; email: string | null }
  /** ISO time it was saved; orders movements of the same date. */
  savedAt: string
  /** Made by journaling (or cancelling) a bank row on an inventory-linked account. */
  source?: MovementSource
  /**
   * Rupiah value: what an "in" cost (purchase, opening stock), or the exact value an "out" takes away
   * (a cancelled purchase). Without it an in or out is valued at the item's average cost (`lib/costing.ts`).
   */
  value?: number
}

export type MovementSource = { kind: "journal"; journal: string; number: string }

export const UNITS = ["kg", "roll", "pcs", "meter", "liter", "sak", "karung", "dus"]

/** Quantities keep 3 decimals (grams on kg). */
export const round3 = (n: number) => Math.round(n * 1000) / 1000

export type ItemInput = Pick<InventoryItem, "name" | "unit" | "group"> & { code: string; department: string; account: string }

/** Letters, digits and . _ - (it is also a document id), stored in capitals. */
export const ITEM_CODE = /^[A-Z0-9][A-Z0-9._-]*$/
export const cleanCode = (code: string) => code.trim().toUpperCase()

/** Next code after the highest of the most used prefix (BB009 → BB010); BRG001 when there are none. */
export function nextCode(codes: (string | undefined)[]) {
  const parts = codes.map((c) => c?.match(/^(.*?)(\d+)$/)).filter((m) => !!m)
  if (!parts.length) return "BRG001"
  const count = new Map<string, number>()
  for (const m of parts) count.set(m[1], (count.get(m[1]) ?? 0) + 1)
  const prefix = [...count].sort((a, b) => b[1] - a[1])[0][0]
  const same = parts.filter((m) => m[1] === prefix)
  const width = Math.max(...same.map((m) => m[2].length))
  return prefix + String(Math.max(...same.map((m) => Number(m[2]))) + 1).padStart(width, "0")
}

/** Reserves `code` for `item` (releasing `previous`); fails when another item has it. */
export async function claimCode(w: Writer, code: string, item: string, previous?: string) {
  if (!ITEM_CODE.test(code)) throw new Error(`Kode "${code}" hanya boleh huruf, angka, titik, garis bawah dan strip.`)
  if (code === previous) return
  const taken = await w.get<{ item: string }>(INVENTORY_CODES, code)
  if (taken && taken.item !== item) throw new Error(`Kode ${code} sudah dipakai bahan baku lain.`)
  await w.set(INVENTORY_CODES, code, { item }, { silent: true })
  if (previous) await w.remove(INVENTORY_CODES, previous, { silent: true })
}
export type MovementInput = { item: string; in: number; out: number; value?: number }

/** Max items per save: each is two documents (movement + item) and their two log entries; Firestore allows 500 writes. */
export const MAX_PER_SAVE = 120

/** Adds an item; an opening stock (with its rupiah value) is saved as its first movement. Returns the id. */
export function addItem(input: ItemInput, opening: { qty: number; date: string; value?: number } | null) {
  return transaction(async (w) => {
    const id = w.newId(INVENTORY_ITEMS)
    const data = clean(input)
    await claimCode(w, data.code, id)
    await w.set(INVENTORY_ITEMS, id, { ...data, stock: 0, active: true })
    if (opening?.qty) await move(w, { item: id, in: opening.qty, out: 0, value: opening.value }, { date: opening.date, note: "Stok awal", batch: w.newId(INVENTORY_MOVEMENTS) })
    return id
  })
}

/** Code, name, unit, group and active; stock only changes through movements. */
export function updateItem(id: string, input: ItemInput & { active: boolean }) {
  return transaction(async (w) => {
    const item = await w.get<InventoryItem>(INVENTORY_ITEMS, id)
    if (!item) throw new Error("Bahan baku tidak ditemukan.")
    const data = clean(input)
    await claimCode(w, data.code, id, item.code)
    await w.update(INVENTORY_ITEMS, id, { ...data, active: input.active })
  })
}

/** Saves several items' in/out at once (all or nothing). Returns how many movements were saved. */
export function saveMovements(entries: MovementInput[], meta: { date: string; note: string }) {
  const rows = entries.filter((e) => e.in > 0 || e.out > 0)
  if (!rows.length) throw new Error("Isi jumlah masuk atau keluar dulu.")
  if (rows.length > MAX_PER_SAVE) throw new Error(`Maksimal ${MAX_PER_SAVE} bahan baku sekali simpan.`)
  return transaction(async (w) => {
    const batch = w.newId(INVENTORY_MOVEMENTS)
    for (const e of rows) await move(w, e, { ...meta, batch })
    return rows.length
  })
}

const clean = (input: ItemInput) => {
  const code = cleanCode(input.code)
  if (!code) throw new Error("Kode bahan baku wajib diisi.")
  return { code, name: input.name.trim(), unit: input.unit.trim(), group: input.group.trim(), department: input.department, account: input.account }
}

/** One movement of one item inside a transaction: checks the stock, writes the movement and the new stock. */
export async function move(w: Writer, e: MovementInput, meta: { date: string; note: string; batch: string; source?: MovementSource }) {
  if (e.in < 0 || e.out < 0) throw new Error("Jumlah tidak boleh minus.")
  const item = await w.get<InventoryItem>(INVENTORY_ITEMS, e.item)
  if (!item) throw new Error("Bahan baku tidak ditemukan.")
  if (!item.active) throw new Error(`${item.name} tidak aktif.`)
  const stock = round3(item.stock + e.in - e.out)
  if (stock < 0) throw new Error(`Stok ${item.name} tidak cukup: ada ${formatNumber(item.stock)} ${item.unit}, keluar ${formatNumber(e.out)} ${item.unit}.`)
  const user = auth.currentUser!
  const movement: Omit<InventoryMovement, "id"> = {
    item: e.item,
    itemCode: item.code ?? "",
    itemName: item.name,
    unit: item.unit,
    date: meta.date,
    in: round3(e.in),
    out: round3(e.out),
    stockAfter: stock,
    note: meta.note.trim(),
    batch: meta.batch,
    by: { uid: user.uid, email: user.email },
    savedAt: new Date().toISOString(),
    ...(meta.source && { source: meta.source }),
    ...(e.value != null && e.value > 0 && { value: Math.round(e.value * 100) / 100 }),
  }
  await w.set(INVENTORY_MOVEMENTS, w.newId(INVENTORY_MOVEMENTS), movement)
  await w.update(INVENTORY_ITEMS, e.item, { stock })
}
