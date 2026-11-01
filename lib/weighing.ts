import { WEIGHINGS, type Weighing } from "@/lib/collections"
import { nextNumber, transaction, type Writer } from "@/lib/db"
import { ensureOpen } from "@/lib/period"
import { addStock } from "@/lib/stock"
import { nowTime } from "@/lib/utils"

export type WeighingInput = Omit<Weighing, "id" | "number" | "net" | "status" | "cancelReason">

/** Above this many kg net a weighing gets a warning (it's still allowed). */
export const MAX_NET_KG = 40_000

export const netOf = (weight1: number | null, weight2: number | null) =>
  weight1 == null || weight2 == null ? null : Math.round((weight1 - weight2) * 1000) / 1000

/** Hard errors that block saving. */
export function weightErrors(weight1: number | null, weight2: number | null) {
  if (weight1 == null || weight1 <= 0) return "Berat masuk harus lebih dari 0."
  if (weight2 != null && weight2 <= 0) return "Berat keluar harus lebih dari 0."
  return null
}

/** Soft warnings: shown live, and confirmed before saving. */
export function weightWarnings(weight1: number | null, weight2: number | null) {
  const net = netOf(weight1, weight2)
  const warnings: string[] = []
  if (weight1 != null && weight2 != null && weight2 > weight1) warnings.push("Berat keluar lebih besar dari berat masuk (neto negatif).")
  if (net != null && net > MAX_NET_KG) warnings.push(`Neto di atas ${MAX_NET_KG.toLocaleString("id-ID")} kg.`)
  return warnings
}

/** Weighs a truck out: sets weight 2 and the net, and only now adds the net to stock. */
async function finish(w: Writer, id: string, weight2: number, timeOut: string) {
  const weighing = await w.get<Weighing>(WEIGHINGS, id)
  if (!weighing) throw new Error("Timbangan tidak ditemukan.")
  if (weighing.status !== "onsite") throw new Error(`${weighing.number} sudah tidak di lokasi.`)
  const net = netOf(weighing.weight1, weight2)!
  await w.update(WEIGHINGS, id, { weight2, net, timeOut, status: "stocked" })
  await addStock(w, {
    kind: "receipt",
    material: weighing.material,
    date: weighing.date,
    qty: net,
    source: { type: "weighing", id, number: weighing.number },
  })
}

/**
 * Saves a truck arrival (new, or edits one still on site). The TM number is
 * assigned on first save. If weight 2 is already known, it's weighed out at once.
 */
export function saveArrival(input: WeighingInput, id?: string) {
  return transaction(async (w) => {
    const { weight2, ...arrival } = input
    await ensureOpen(w, input.date)
    if (id) {
      const current = await w.get<Weighing>(WEIGHINGS, id)
      if (current?.status !== "onsite") throw new Error("Hanya truk yang masih di lokasi yang bisa diubah.")
      await ensureOpen(w, current.date)
      await w.update(WEIGHINGS, id, arrival)
    } else {
      id = w.newId(WEIGHINGS)
      const number = await nextNumber(w, "TM", input.date)
      await w.set(WEIGHINGS, id, {
        ...arrival,
        number,
        weight2: null,
        net: null,
        status: "onsite",
        cancelReason: "",
      } satisfies Omit<Weighing, "id">)
    }
    if (weight2 != null) await finish(w, id, weight2, input.timeOut || nowTime())
    return id
  })
}

export function weighOut(id: string, weight2: number) {
  return transaction((w) => finish(w, id, weight2, nowTime()))
}

/** Only a truck still on site can be cancelled; nothing has touched stock yet. */
export function cancelWeighing(id: string, reason: string) {
  return transaction(async (w) => {
    const weighing = await w.get<Weighing>(WEIGHINGS, id)
    if (weighing?.status !== "onsite") throw new Error("Hanya truk yang masih di lokasi yang bisa dibatalkan.")
    await ensureOpen(w, weighing.date)
    await w.update(WEIGHINGS, id, { status: "cancelled", cancelReason: reason })
  })
}
