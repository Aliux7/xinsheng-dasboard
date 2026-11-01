import { PROCESSINGS, type Material, type ProcessType, type Processing } from "@/lib/collections"
import { nextNumber, transaction } from "@/lib/db"
import { addStock, ensureStock, round3, stockErrors } from "@/lib/stock"

export type ProcessingInput = Omit<Processing, "id" | "number" | "shrinkage" | "shrinkagePct">

const PREFIX: Record<ProcessType, string> = { wash: "CC", recycle: "RC" }

/** Adds up lines that use the same material, dropping empty ones. */
export function mergeInputs(inputs: { material: string; qty: number | null }[]) {
  const totals = new Map<string, number>()
  for (const { material, qty } of inputs) if (material && qty) totals.set(material, (totals.get(material) ?? 0) + qty)
  return [...totals].map(([material, qty]) => ({ material, qty: round3(qty) }))
}

export function shrinkageOf(totalInput: number, cleanWeight: number | null) {
  if (!totalInput || cleanWeight == null) return null
  const kg = round3(totalInput - cleanWeight)
  return { kg, pct: Math.round((kg / totalInput) * 10000) / 100 }
}

/** Shrinkage split over the inputs by their share of the total; the last one takes the rounding remainder. */
export function splitShrinkage(inputs: { material: string; qty: number }[], shrinkage: number) {
  const total = inputs.reduce((sum, i) => sum + i.qty, 0)
  let left = shrinkage
  return inputs.map((input, i) => {
    const share = i === inputs.length - 1 ? round3(left) : round3((shrinkage * input.qty) / total)
    left -= share
    return { ...input, shrinkage: share }
  })
}

/** Problems that block saving, checked live in the form against the stock it can see. */
export function processingErrors(inputs: { material: string; qty: number }[], cleanWeight: number | null, materials: Material[]) {
  const total = inputs.reduce((sum, i) => sum + i.qty, 0)
  const errors = stockErrors(inputs, materials)
  if (cleanWeight != null && cleanWeight > total) errors.push("Berat bersih tidak boleh melebihi total input.")
  return errors
}

/**
 * Saves a washing or recycling run in one transaction: each input goes down by its kg
 * (as "processOut" for the part that became output + "shrinkage" for its share of the loss),
 * and the output goes up by the clean weight.
 */
export function saveProcessing(form: ProcessingInput) {
  return transaction(async (w) => {
    const inputs = mergeInputs(form.inputs)
    if (!inputs.length) throw new Error("Tambahkan minimal satu bahan input.")
    if (inputs.some((i) => i.material === form.output)) throw new Error("Bahan output tidak boleh sama dengan input.")
    const total = round3(inputs.reduce((sum, i) => sum + i.qty, 0))
    if (form.cleanWeight <= 0) throw new Error("Berat bersih harus lebih dari 0.")
    if (form.cleanWeight > total) throw new Error("Berat bersih tidak boleh melebihi total input.")
    const { kg, pct } = shrinkageOf(total, form.cleanWeight)!

    const id = w.newId(PROCESSINGS)
    const number = await nextNumber(w, PREFIX[form.type], form.date)
    const source = { type: "processing", id, number }

    for (const input of inputs) await ensureStock(w, input.material, input.qty)
    for (const input of splitShrinkage(inputs, kg)) {
      const used = round3(input.qty - input.shrinkage)
      if (used) await addStock(w, { kind: "processOut", material: input.material, date: form.date, qty: -used, source })
      if (input.shrinkage) await addStock(w, { kind: "shrinkage", material: input.material, date: form.date, qty: -input.shrinkage, source })
    }
    await addStock(w, { kind: "processIn", material: form.output, date: form.date, qty: form.cleanWeight, source })

    await w.set(PROCESSINGS, id, {
      ...form,
      inputs,
      number,
      shrinkage: kg,
      shrinkagePct: pct,
    } satisfies Omit<Processing, "id">)
    return number
  })
}
