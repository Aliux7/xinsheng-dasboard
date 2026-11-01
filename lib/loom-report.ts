import { serverTimestamp } from "firebase/firestore"

import type { ClothGrade, Roll } from "@/lib/collections"
import { transaction } from "@/lib/db"
import { auth } from "@/lib/firebase"
import { LOOM_PERIODS } from "@/lib/rolls"
import { round3 } from "@/lib/stock"
import { monthRange } from "@/lib/utils"

/** Rolls, kg and metres. */
export type Qty = { rolls: number; kg: number; metres: number }
export type GradeRow = { grade: string; name: string; begin: Qty; produced: Qty; issued: Qty; end: Qty }
export type MachineRow = { machine: string; rolls: number; kg: number }
export type LoomPeriod = { id: string; grades: GradeRow[]; machines: MachineRow[]; closedBy: { email: string | null }; closedAt: never }

const zero = (): Qty => ({ rolls: 0, kg: 0, metres: 0 })
const add = (q: Qty, r: Roll) => ({ rolls: q.rolls + 1, kg: round3(q.kg + r.kg), metres: round3(q.metres + r.metres) })
export const sumQty = (qs: Qty[]) => qs.reduce((t, q) => ({ rolls: t.rolls + q.rolls, kg: round3(t.kg + q.kg), metres: round3(t.metres + q.metres) }), zero())

/**
 * Per grade: Begin = produced before the month and still in stock at its start;
 * Produced / Issued within the month; End = Begin + Produced − Issued.
 */
export function loomMonth(month: string, rolls: Roll[], grades: ClothGrade[]) {
  const [start, end] = monthRange(month)
  const inMonth = (date: string) => !!date && date >= start && date < end
  const stillThere = (r: Roll, at: string) => r.date < at && (r.status === "instock" || r.issueDate >= at)

  const codes = [...new Set([...grades.map((g) => g.code), ...rolls.map((r) => r.grade)])]
  const gradeRows: GradeRow[] = codes
    .map((code) => {
      const these = rolls.filter((r) => r.grade === code)
      const row: GradeRow = {
        grade: code,
        name: grades.find((g) => g.code === code)?.name ?? code,
        begin: these.filter((r) => stillThere(r, start)).reduce(add, zero()),
        produced: these.filter((r) => inMonth(r.date)).reduce(add, zero()),
        issued: these.filter((r) => r.status === "issued" && inMonth(r.issueDate)).reduce(add, zero()),
        end: these.filter((r) => stillThere(r, end)).reduce(add, zero()),
      }
      return row
    })
    .filter((r) => r.begin.rolls || r.produced.rolls || r.issued.rolls || r.end.rolls)
    .sort((a, b) => a.grade.localeCompare(b.grade))

  const machines = new Map<string, MachineRow>()
  for (const r of rolls.filter((r) => inMonth(r.date))) {
    const m = machines.get(r.machine) ?? { machine: r.machine, rolls: 0, kg: 0 }
    machines.set(r.machine, { ...m, rolls: m.rolls + 1, kg: round3(m.kg + r.kg) })
  }
  const machineRows = [...machines.values()].sort((a, b) => a.machine.localeCompare(b.machine, undefined, { numeric: true }))
  return { grades: gradeRows, machines: machineRows }
}

/** Closes a loom month: saves the figures; no roll dated in it can be added or issued afterwards. */
export function closeLoomMonth(month: string, report: { grades: GradeRow[]; machines: MachineRow[] }) {
  return transaction(async (w) => {
    if (await w.get(LOOM_PERIODS, month)) throw new Error(`Bulan loom ${month} sudah ditutup.`)
    await w.set(LOOM_PERIODS, month, {
      ...report,
      closedBy: { uid: auth.currentUser!.uid, email: auth.currentUser!.email },
      closedAt: serverTimestamp(),
    })
  })
}
