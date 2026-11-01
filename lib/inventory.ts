import {
  INVENTORY_ACCOUNTS as ACC,
  INVENTORY_POSTINGS,
  type Material,
  type MaterialMap,
  type PurchaseInvoice,
  type StockMovement,
  type Weighing,
} from "@/lib/collections"
import { transaction } from "@/lib/db"
import { emptyLine, jvNumber, post, round2 } from "@/lib/journal"
import { PERIODS } from "@/lib/period"
import { previousMonth } from "@/lib/report"
import { round3 } from "@/lib/stock"
import { monthRange } from "@/lib/utils"

/**
 * Inventory value (Nilai persediaan): monthly weighted-average cost per warehouse material.
 * - Truck deliveries are valued from their matched purchase invoice (mapped lines, split by kg);
 *   unmatched deliveries come in at the current average, so they don't distort it.
 * - Washed/recycled output takes the full value of the inputs of the same document
 *   (including the shrinkage, a normal loss absorbed by the output).
 * - Usage, washing input, shrinkage and count losses leave at the month's average.
 */

export type ValueRow = {
  material: string
  name: string
  beginKg: number
  beginValue: number
  inKg: number
  inValue: number
  usedKg: number
  usedValue: number
  /** Usage + count losses: what's posted as material used (washing input and shrinkage move into the output). */
  consumedValue: number
  endKg: number
  endValue: number
  avgCost: number
}

const ORDER: Record<string, number> = { original: 0, dirty: 1, clean: 2, recycled: 3 }

/** Value of each matched delivery: the invoice's mapped-line amount, split over its weighings of that material by kg. */
export function deliveryValues(weighings: Weighing[], invoices: PurchaseInvoice[], maps: MaterialMap[]) {
  const values = new Map<string, number>()
  for (const inv of invoices) {
    if (!inv.weighings?.length) continue
    const linked = weighings.filter((w) => inv.weighings!.includes(w.id))
    for (const material of new Set(linked.map((w) => w.material))) {
      const items = maps.find((m) => m.id === material)?.items ?? []
      const amount = inv.lines.filter((l) => items.includes(l.item)).reduce((s, l) => s + l.amount, 0)
      const these = linked.filter((w) => w.material === material)
      const kg = these.reduce((s, w) => s + (w.net ?? 0), 0)
      for (const w of these) values.set(w.id, kg ? round2((amount * (w.net ?? 0)) / kg) : 0)
    }
  }
  return values
}

/** Value rows for every month from the first movement up to `lastMonth`; returns the rows of each month. */
export function valuation(movements: StockMovement[], materials: Material[], delivery: Map<string, number>, lastMonth: string) {
  const months: string[] = []
  const first = movements.map((m) => m.date.slice(0, 7)).sort()[0]
  if (first) for (let m = lastMonth; m >= first; m = previousMonth(m)) months.unshift(m)

  const state = new Map<string, { kg: number; value: number }>()
  const byMonth = new Map<string, ValueRow[]>()
  const sorted = [...materials].sort((a, b) => (ORDER[a.condition] ?? 0) - (ORDER[b.condition] ?? 0))

  for (const month of months) {
    const [start, end] = monthRange(month)
    const these = movements.filter((m) => m.date >= start && m.date < end)
    const docValue = new Map<string, number>() // value leaving inputs, per washing/recycling document
    const rows: ValueRow[] = []
    for (const material of sorted) {
      const mine = these.filter((m) => m.material === material.code)
      const begin = state.get(material.code) ?? { kg: 0, value: 0 }
      const beginAvg = begin.kg > 0 ? begin.value / begin.kg : 0
      let inKg = 0
      let inValue = 0
      for (const m of mine.filter((x) => x.qty > 0)) {
        inKg += m.qty
        if (m.kind === "receipt") inValue += delivery.get(m.source.id) ?? m.qty * beginAvg
        else if (m.kind === "processIn") inValue += docValue.get(m.source.id) ?? 0
        else inValue += m.qty * beginAvg // count surplus at average
      }
      const kgAvail = begin.kg + inKg
      const avg = kgAvail > 0 ? (begin.value + inValue) / kgAvail : 0
      let usedKg = 0
      let usedValue = 0
      let consumed = 0
      for (const m of mine.filter((x) => x.qty < 0)) {
        const value = -m.qty * avg
        usedKg += -m.qty
        usedValue += value
        if (m.kind === "processOut" || m.kind === "shrinkage") docValue.set(m.source.id, (docValue.get(m.source.id) ?? 0) + value)
        else consumed += value
      }
      const endKg = round3(kgAvail - usedKg)
      const endValue = round2(begin.value + inValue - usedValue)
      state.set(material.code, { kg: endKg, value: endValue })
      if (begin.kg || inKg || usedKg)
        rows.push({
          material: material.code,
          name: material.name,
          beginKg: round3(begin.kg),
          beginValue: round2(begin.value),
          inKg: round3(inKg),
          inValue: round2(inValue),
          usedKg: round3(usedKg),
          usedValue: round2(usedValue),
          consumedValue: round2(consumed),
          endKg,
          endValue,
          avgCost: round2(avg),
        })
    }
    byMonth.set(month, rows)
  }
  return byMonth
}

/**
 * Posts the month's material used: cost of production (WIP 105201) debit / raw material 105101 credit.
 * Only for a closed warehouse month, and only once.
 */
export function postMaterialUsed(month: string, value: number) {
  return transaction(async (w) => {
    if (!(await w.get(PERIODS, month))) throw new Error(`Tutup buku gudang ${month} dulu.`)
    if (await w.get(INVENTORY_POSTINGS, month)) throw new Error(`Pemakaian bahan ${month} sudah diposting.`)
    const [, next] = monthRange(month)
    const date = new Date(Date.parse(`${next}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10)
    const id = `inv-${month}`
    const text = `Pemakaian bahan baku ${month}`
    const journal = await post(
      w,
      {
        date,
        source: "gl",
        counterparty: "",
        description: text,
        lines: [
          { ...emptyLine(), account: ACC.wip, description: text, debit: round2(value) },
          { ...emptyLine(), account: ACC.rawMaterial, description: text, credit: round2(value) },
        ],
      },
      (w) => jvNumber(w, date),
      { document: { type: "inventoryPosting", id, number: month } }
    )
    await w.set(INVENTORY_POSTINGS, month, { value: round2(value), journalId: journal.id, number: journal.number })
    return journal.number
  })
}

/** Saves which purchase items (IA) belong to a warehouse material (BB). */
export function saveMaterialMap(material: string, items: string[]) {
  return transaction((w) => w.set("materialMaps", material, { items }))
}
