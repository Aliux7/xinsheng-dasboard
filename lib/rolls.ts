import { serverTimestamp } from "firebase/firestore"

import { ROLLS, type ClothGrade, type Roll } from "@/lib/collections"
import { transaction, type Writer } from "@/lib/db"
import { auth } from "@/lib/firebase"
import { monthOf } from "@/lib/period"

/** Closed loom months, separate from the warehouse's: `loomPeriods/{YYYY-MM}`. */
export const LOOM_PERIODS = "loomPeriods"

export async function ensureLoomOpen(w: Writer, date: string) {
  if (await w.get(LOOM_PERIODS, monthOf(date))) {
    throw new Error(`Bulan loom ${monthOf(date)} sudah ditutup. Roll di bulan ini tidak bisa ditambah atau dikeluarkan.`)
  }
}

/** g/m² = kg × 1000 ÷ (length × width), rounded to 0,01. */
export const gsmOf = (kg: number | null, metres: number | null, width: number | null) =>
  kg && metres && width ? Math.round(((kg * 1000) / (metres * width)) * 100) / 100 : null

/** True when the weight per m² is outside the grade's standard ± allowed difference. */
export const offStandard = (gsm: number | null, grade?: ClothGrade) =>
  gsm != null && grade?.weight != null && Math.abs(gsm - grade.weight) > (grade.tolerance ?? 0)

/** Roll numbers run on from the last one: `counters/ROLL` = { last }. */
const COUNTER = { path: "counters", id: "ROLL" }

export type RollInput = Omit<Roll, "id" | "number" | "gsm" | "status" | "issueDate" | "destination">

/** Saves a new roll with the next roll number and status "Di stok". */
export function saveRoll(form: RollInput) {
  return transaction(async (w) => {
    await ensureLoomOpen(w, form.date)
    const number = ((await w.get<{ last: number }>(COUNTER.path, COUNTER.id))?.last ?? 0) + 1
    await w.set(COUNTER.path, COUNTER.id, { last: number }, { silent: true })
    if (await w.get(ROLLS, String(number))) throw new Error(`Roll ${number} sudah ada.`)
    await w.set(ROLLS, String(number), {
      ...form,
      number,
      gsm: gsmOf(form.kg, form.metres, form.width) ?? 0,
      status: "instock",
      issueDate: "",
      destination: "",
      createdAt: serverTimestamp(),
    })
    return number
  })
}

/** "Keluarkan": the rolls leave stock but stay in the history. */
export function issueRolls(ids: string[], date: string, destination: string) {
  return transaction(async (w) => {
    await ensureLoomOpen(w, date)
    for (const id of ids) {
      const roll = await w.get<Roll>(ROLLS, id)
      if (roll?.status !== "instock") throw new Error(`Roll ${id} tidak di stok.`)
      if (date < roll.date) throw new Error(`Roll ${id} baru dipanen ${roll.date}; tanggal keluar tidak boleh lebih awal.`)
    }
    for (const id of ids) await w.update(ROLLS, id, { status: "issued", issueDate: date, destination, issuedBy: auth.currentUser?.email ?? "" })
  })
}

/** Sets the roll counter so new numbers continue after `last` (used by the import). */
export function setRollCounter(w: Writer, last: number) {
  return w.set(COUNTER.path, COUNTER.id, { last }, { silent: true })
}
