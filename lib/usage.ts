import { USAGES, type Usage } from "@/lib/collections"
import { nextNumber, transaction } from "@/lib/db"
import { mergeInputs } from "@/lib/processing"
import { addStock, ensureStock, round3 } from "@/lib/stock"

export type UsageInput = Omit<Usage, "id" | "number" | "total" | "lines"> & {
  lines: { material: string; qty: number | null }[]
}

/**
 * Saves material usage (OUT/…): each material goes down by its kg. The same
 * material on two lines is merged into one. Refuses if any stock would go below zero.
 */
export function saveUsage(form: UsageInput) {
  return transaction(async (w) => {
    const lines = mergeInputs(form.lines)
    if (!lines.length) throw new Error("Tambahkan minimal satu bahan.")
    for (const line of lines) await ensureStock(w, line.material, line.qty)

    const id = w.newId(USAGES)
    const number = await nextNumber(w, "OUT", form.date)
    const source = { type: "usage", id, number }
    for (const line of lines) {
      await addStock(w, { kind: "usage", material: line.material, date: form.date, qty: -line.qty, source })
    }
    const total = round3(lines.reduce((sum, l) => sum + l.qty, 0))
    await w.set(USAGES, id, { ...form, lines, number, total } satisfies Omit<Usage, "id">)
    return number
  })
}
