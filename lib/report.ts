import { serverTimestamp } from "firebase/firestore"

import type { Department, Material, StockKind, StockMovement } from "@/lib/collections"
import { transaction } from "@/lib/db"
import { auth } from "@/lib/firebase"
import { PERIODS, type MonthRow } from "@/lib/period"
import { round3 } from "@/lib/stock"

/** Which column each movement type lands in. Usage, washing input and shrinkage are stored as negatives. */
const COLUMN: Record<StockKind, "in" | "used" | "shrinkage" | "adjustment"> = {
  receipt: "in",
  processIn: "in",
  usage: "used",
  processOut: "used",
  shrinkage: "shrinkage",
  adjustment: "adjustment",
}

/** "2026-10" → "2026-09" */
export function previousMonth(month: string) {
  const [y, m] = month.split("-").map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`
}

/** Number of days in "YYYY-MM", without reading the clock. */
export function daysIn(month: string) {
  const [y, m] = month.split("-").map(Number)
  if (m === 2) return y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 29 : 28
  return [4, 6, 9, 11].includes(m) ? 30 : 31
}

/**
 * Report rows for one month. `begin` comes from the previous month's closed figures
 * when there are any, otherwise from `earlier` (every movement before the month).
 * End = Begin + In − Used − Shrinkage ± Adjustment.
 */
export function monthRows(
  materials: Material[],
  departments: Department[],
  movements: StockMovement[],
  begin: { closed?: MonthRow[]; earlier?: StockMovement[] }
): MonthRow[] {
  const opening = new Map<string, number>()
  if (begin.closed) for (const r of begin.closed) opening.set(r.material, r.end)
  else for (const m of begin.earlier ?? []) opening.set(m.material, (opening.get(m.material) ?? 0) + m.qty)

  const deptName = (code: string) => departments.find((d) => d.code === code)?.name || code
  return materials
    .map((material) => {
      const row: MonthRow = {
        material: material.code,
        name: material.name,
        department: deptName(material.department),
        unit: material.unit,
        begin: round3(opening.get(material.code) ?? 0),
        in: 0,
        used: 0,
        shrinkage: 0,
        adjustment: 0,
        end: 0,
      }
      for (const m of movements) {
        if (m.material !== material.code) continue
        const column = COLUMN[m.kind]
        row[column] = round3(row[column] + (column === "in" || column === "adjustment" ? m.qty : -m.qty))
      }
      row.end = round3(row.begin + row.in - row.used - row.shrinkage + row.adjustment)
      return { row, active: material.active }
    })
    .filter(({ row, active }) => active || row.begin || row.in || row.used || row.shrinkage || row.adjustment)
    .map(({ row }) => row)
    .sort((a, b) => a.department.localeCompare(b.department) || a.material.localeCompare(b.material, undefined, { numeric: true }))
}

export function totalsOf(rows: MonthRow[]) {
  const sum = (key: "begin" | "in" | "used" | "shrinkage" | "adjustment" | "end") =>
    round3(rows.reduce((total, r) => total + r[key], 0))
  return { begin: sum("begin"), in: sum("in"), used: sum("used"), shrinkage: sum("shrinkage"), adjustment: sum("adjustment"), end: sum("end") }
}

/** Tutup buku: saves the figures and locks the month. Admin only (firestore.rules). */
export function closeMonth(month: string, rows: MonthRow[]) {
  return transaction(async (w) => {
    if (await w.get(PERIODS, month)) throw new Error(`Bulan ${month} sudah ditutup.`)
    await w.set(PERIODS, month, {
      rows,
      closedBy: { uid: auth.currentUser!.uid, email: auth.currentUser!.email },
      closedAt: serverTimestamp(),
    })
  })
}
