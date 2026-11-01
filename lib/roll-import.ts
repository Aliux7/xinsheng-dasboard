import { serverTimestamp } from "firebase/firestore"
import { readSheet } from "read-excel-file/browser"

import { LOOM_DEFAULTS, ROLLS, type ClothGrade, type Loom, type Roll } from "@/lib/collections"
import { transaction } from "@/lib/db"
import type { TemplateSheet } from "@/lib/excel-template"
import { auth } from "@/lib/firebase"
import { gsmOf, setRollCounter } from "@/lib/rolls"
import { round3 } from "@/lib/stock"
import { toNumber } from "@/lib/utils"

/**
 * One-time import of the cloth rolls from Laporan Kain Loom-September.xlsx, sheet DATA
 * rows 3–422 (rows 423–1002 are empty templates). Roll numbers are kept; the next new
 * roll continues after the highest. `imports/loom-rolls` stops a second run.
 */
export const ROLL_IMPORT_DOC = { path: "imports", id: "loom-rolls" }

type Cell = string | number | boolean | Date | null
type NewRoll = Omit<Roll, "id">

/** The columns `buildRollPlan` reads from sheet DATA. */
export const ROLL_TEMPLATE: TemplateSheet[] = [
  {
    name: "DATA",
    headerRow: 2,
    lastRow: 422,
    columns: [
      { col: "A", header: "No. roll", required: true, example: "1" },
      { col: "B", header: "Status", example: "OK" },
      { col: "D", header: "Tanggal", required: true, example: "2026-05-06" },
      { col: "E", header: "Tipe kain", required: true, example: "G1 54克" },
      { col: "F", header: "Kain", example: "兰灰布 ABU" },
      { col: "G", header: "No. mesin", required: true, example: "12" },
      { col: "H", header: "Kg", required: true, example: "1250,5" },
      { col: "I", header: "Meter", required: true, example: "4000" },
      { col: "J", header: "g/m²", example: "54" },
      { col: "M", header: "Tanggal keluar", example: "2026-05-20" },
      { col: "AB", header: "Lokasi", example: "Gudang 1" },
      { col: "AD", header: "Catatan" },
    ],
  },
]

export type RollPlan = {
  rolls: NewRoll[]
  perGrade: { grade: string; rolls: number; kg: number; metres: number; issued: number }[]
  /** Rows skipped, with the reason. */
  skipped: { row: number; reason: string }[]
  missing: { grades: string[]; machines: string[] }
  highest: number
}

const text = (c: Cell) => (c == null ? "" : c instanceof Date ? c.toISOString() : String(c).trim())
const ymd = (c: Cell) => (c instanceof Date ? c.toISOString().slice(0, 10) : text(c).slice(0, 10))
const num = (c: Cell) => toNumber(text(c))

export async function buildRollPlan(file: File, db: { grades: ClothGrade[]; machines: Loom[] }): Promise<RollPlan> {
  const data = (await readSheet(file, "DATA")) as Cell[][]
  const rolls: NewRoll[] = []
  const skipped: RollPlan["skipped"] = []
  const seen = new Set<number>()

  data.slice(2, 422).forEach((c, i) => {
    const row = i + 3
    const number = num(c[0])
    // A: roll, B: status, D: date, E: grade, F: cloth, G: machine, H: kg, I: metres, J: g/m², M: out date, AB: location, AD: note
    if (!text(c[3]) && !text(c[4])) return // empty template row
    if (number == null) return skipped.push({ row, reason: "Tidak ada nomor roll." })
    if (seen.has(number)) return skipped.push({ row, reason: `Nomor roll ${number} dobel.` })
    seen.add(number)
    const kg = num(c[7]) ?? 0
    const metres = num(c[8]) ?? 0
    const outDate = c[12] ? ymd(c[12]) : ""
    rolls.push({
      number,
      date: ymd(c[3]),
      // "G1 54克" → grade code G1
      grade: text(c[4]).split(/\s+/)[0].toUpperCase(),
      machine: text(c[6]),
      kg,
      metres,
      width: LOOM_DEFAULTS.width,
      gsm: gsmOf(kg, metres, LOOM_DEFAULTS.width) ?? num(c[9]) ?? 0,
      location: text(c[27]),
      note: [text(c[29]), text(c[5]) && `Kain: ${text(c[5])}`, text(c[1]) && `Status Excel: ${text(c[1])}`].filter(Boolean).join(" · "),
      status: outDate ? "issued" : "instock",
      issueDate: outDate,
      destination: outDate ? LOOM_DEFAULTS.destination : "",
    })
  })

  const grades = new Set(db.grades.map((g) => g.code))
  const machines = new Set(db.machines.map((m) => m.code))
  const perGrade = [...new Set(rolls.map((r) => r.grade))].sort().map((grade) => {
    const these = rolls.filter((r) => r.grade === grade)
    return {
      grade,
      rolls: these.length,
      kg: round3(these.reduce((s, r) => s + r.kg, 0)),
      metres: round3(these.reduce((s, r) => s + r.metres, 0)),
      issued: these.filter((r) => r.status === "issued").length,
    }
  })

  return {
    rolls,
    perGrade,
    skipped,
    missing: {
      grades: [...new Set(rolls.map((r) => r.grade))].filter((g) => !grades.has(g)).sort(),
      machines: [...new Set(rolls.map((r) => r.machine))].filter((m) => !machines.has(m)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    },
    highest: Math.max(0, ...rolls.map((r) => r.number)),
  }
}

/** Writes the rolls in chunks (resuming if stopped), sets the roll counter and marks the import done. */
export async function runRollImport(plan: RollPlan, onProgress: (done: number, total: number) => void) {
  const by = { uid: auth.currentUser!.uid, email: auth.currentUser!.email }
  await transaction(async (w) => {
    const marker = await w.get<{ status: string }>(ROLL_IMPORT_DOC.path, ROLL_IMPORT_DOC.id)
    if (marker?.status === "done") throw new Error("Impor roll loom sudah pernah dijalankan.")
    if (!marker) await w.set(ROLL_IMPORT_DOC.path, ROLL_IMPORT_DOC.id, { status: "running", by, startedAt: serverTimestamp() })
  })

  const CHUNK = 100
  for (let i = 0; i < plan.rolls.length; i += CHUNK) {
    const chunk = plan.rolls.slice(i, i + CHUNK)
    await transaction(
      async (w) => {
        const exists = await Promise.all(chunk.map((r) => w.get(ROLLS, String(r.number))))
        for (const [j, roll] of chunk.entries()) {
          if (!exists[j]) await w.set(ROLLS, String(roll.number), { ...roll, imported: true })
        }
      },
      { silent: true }
    )
    onProgress(Math.min(i + CHUNK, plan.rolls.length), plan.rolls.length)
  }

  await transaction((w) => setRollCounter(w, plan.highest))
  const summary = { rolls: plan.rolls.length, highest: plan.highest, perGrade: plan.perGrade }
  await transaction((w) => w.update(ROLL_IMPORT_DOC.path, ROLL_IMPORT_DOC.id, { status: "done", summary, finishedAt: serverTimestamp() }))
  return summary
}
