import { serverTimestamp } from "firebase/firestore"

import { MATERIALS, STOCK_MOVEMENTS, type Material, type StockKind } from "@/lib/collections"
import type { Writer } from "@/lib/db"
import { ensureOpen } from "@/lib/period"

/** Rounds to grams, avoiding floating-point dust like 0.30000000000000004. */
export const round3 = (n: number) => Math.round(n * 1000) / 1000

const kg = (n: number) => n.toLocaleString("id-ID", { maximumFractionDigits: 3 })

export const notEnough = (code: string, available: number, requested: number) =>
  `Stok ${code} tidak cukup. Tersedia ${kg(available)} kg, diminta ${kg(requested)} kg.`

/** Live check for a form: one message per line that asks for more than the stock it can see. */
export function stockErrors(lines: { material: string; qty: number }[], materials: Material[]) {
  return lines.flatMap(({ material, qty }) => {
    const available = materials.find((m) => m.code === material)?.stock ?? 0
    return qty > available ? [notEnough(material, available, qty)] : []
  })
}

/** Inside a transaction: refuses if `qty` is more than the material has right now. */
export async function ensureStock(w: Writer, material: string, qty: number) {
  const available = (await w.get<Material>(MATERIALS, material))?.stock ?? 0
  if (qty > available) throw new Error(notEnough(material, available, qty))
}

/**
 * Changes a material's stock and records the stock movement, inside an open
 * transaction. Every page that moves stock (weighing, usage, stock count…) uses this.
 * The stock can never go below zero.
 */
export async function addStock(
  w: Writer,
  move: { kind: StockKind; material: string; date: string; qty: number; source: { type: string; id: string; number: string } },
  /** Only for the one-time history import, where the Excel log briefly dipped below zero. */
  options: { allowNegative?: boolean } = {}
) {
  await ensureOpen(w, move.date)
  const material = await w.get<Material>(MATERIALS, move.material)
  if (!material) throw new Error(`Bahan baku ${move.material} tidak ditemukan.`)
  const before = material.stock ?? 0
  const balanceAfter = round3(before + move.qty)
  if (balanceAfter < 0 && !options.allowNegative) throw new Error(notEnough(move.material, before, -move.qty))
  await w.update(MATERIALS, move.material, { stock: balanceAfter })
  // `at` orders movements that share a date.
  await w.set(STOCK_MOVEMENTS, w.newId(STOCK_MOVEMENTS), { ...move, balanceAfter, at: serverTimestamp() })
  return balanceAfter
}
