import { serverTimestamp } from "firebase/firestore"
import { readSheet } from "read-excel-file/browser"

import {
  PROCESSINGS,
  USAGES,
  WEIGHINGS,
  type Department,
  type Material,
  type StockKind,
  type StockMovement,
  type Supplier,
  type Weighing,
} from "@/lib/collections"
import { counterId, formatDocNumber, transaction } from "@/lib/db"
import type { TemplateSheet } from "@/lib/excel-template"
import { auth } from "@/lib/firebase"
import { PERIODS, type MonthRow } from "@/lib/period"
import { monthRows } from "@/lib/report"
import { addStock, round3 } from "@/lib/stock"
import { toNumber } from "@/lib/utils"

/**
 * One-time import of the warehouse history from Laporan Bahan Baku-September.xlsx
 * (May–September 2026). `buildPlan` reads and checks everything without writing;
 * `runImport` writes it, closes the months and records `imports/warehouse-history`
 * so it can't run twice. Document ids are fixed, so a run that stops halfway resumes.
 */

export const IMPORT_DOC = { path: "imports", id: "warehouse-history" }
export const MONTHS = ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09"]

/** The sheets and columns `buildPlan` reads. The monthly sheets are optional (only used to cross-check). */
export const WAREHOUSE_TEMPLATE: TemplateSheet[] = [
  {
    name: "SUPPLIER",
    headerRow: 1,
    lastRow: 100,
    columns: [
      { col: "A", header: "Kode pemasok", required: true, example: "SP0001" },
      { col: "B", header: "Nama pemasok", required: true, example: "PT CONTOH JAYA" },
    ],
  },
  {
    name: "TIMBANGAN",
    headerRow: 4,
    lastRow: 209,
    columns: [
      { col: "B", header: "No. TM", required: true, example: "TM/26E00001" },
      { col: "D", header: "Tanggal", required: true, example: "2026-05-06" },
      { col: "E", header: "Plat nomor", required: true, example: "B 1234 XY" },
      { col: "F", header: "Kontainer", example: "TCLU1234567" },
      { col: "G", header: "Kode pemasok", required: true, example: "SP0001" },
      { col: "H", header: "Nama pemasok", example: "PT CONTOH JAYA" },
      { col: "J", header: "Jam masuk", example: "08:15" },
      { col: "K", header: "Berat masuk", required: true, example: "25000" },
      { col: "L", header: "Jam keluar", example: "09:40" },
      { col: "M", header: "Berat keluar", required: true, example: "10000" },
      { col: "N", header: "Netto", required: true, example: "15000" },
      { col: "O", header: "Sopir", example: "Budi" },
      { col: "P", header: "Catatan" },
      { col: "Q", header: "Kadar air", example: "2" },
      { col: "R", header: "Kode bahan", required: true, example: "BB10001" },
    ],
  },
  ...(["HASIL CUCI", "RECYCLE"] as const).map((name) => ({
    name,
    headerRow: 4,
    lastRow: name === "HASIL CUCI" ? 133 : 95,
    columns: [
      { col: "C", header: "Tanggal", required: true, example: "2026-05-07" },
      { col: "D", header: "Kode bahan hasil", required: true, example: "BB10003" },
      { col: "G", header: "Kg", required: true, example: "1200" },
    ],
  })),
  {
    name: "OUT",
    headerRow: 6,
    lastRow: 735,
    columns: [
      { col: "C", header: "Tanggal", required: true, example: "2026-05-07" },
      { col: "D", header: "Shift", required: true, example: "1" },
      { col: "E", header: "Departemen", required: true, example: "LOOM" },
      { col: "F", header: "Kode bahan", required: true, example: "BB10001" },
      { col: "J", header: "Kg", required: true, example: "500" },
    ],
  },
  ...MONTHS.map((name) => ({
    name,
    headerRow: 5,
    lastRow: 200,
    optional: true,
    note: "Opsional: angka bulanan dari laporan lama, hanya untuk dicocokkan dengan hasil impor.",
    columns: [
      { col: "A", header: "Kode bahan", required: true, example: "BB10001" },
      { col: "E", header: "Awal", example: "0" },
      { col: "F", header: "Masuk", example: "15000" },
      { col: "G", header: "Keluar", example: "500" },
      { col: "H", header: "Susut", example: "0" },
      { col: "I", header: "Saldo", example: "14500" },
    ],
  })),
]

type Cell = string | number | boolean | Date | null
type ImportedWeighing = Omit<Weighing, "id"> & { docId: string; row: number }
type Output = { docId: string; row: number; type: "wash" | "recycle"; number: string; date: string; material: string; qty: number }
type UsageDoc = { docId: string; number: string; date: string; shift: string; department: string; lines: { material: string; qty: number }[]; total: number }
type Event = { date: string; order: number; kind: "weighing" | "output" | "usage"; index: number }

export type Plan = {
  weighings: ImportedWeighing[]
  outputs: Output[]
  usages: UsageDoc[]
  events: Event[]
  /** Repeated TM numbers: the first keeps it, later ones get -2, -3. */
  renamed: { row: number; from: string; to: string }[]
  /** Supplier codes not on the SUPPLIER sheet, matched by name. */
  remapped: { row: number; from: string; to: string; name: string }[]
  /** Moments the running stock went below zero (allowed for this import only). */
  dips: { date: string; material: string; balance: number }[]
  /** Our figures vs the monthly sheets (columns E–I). Empty = everything matches. */
  differences: { month: string; material: string; field: string; ours: number; sheet: number }[]
  /** Codes the app doesn't have yet (import them first). */
  missing: { materials: string[]; suppliers: string[]; departments: string[] }
  counters: { id: string; last: number }[]
}

const text = (c: Cell) => (c == null ? "" : c instanceof Date ? c.toISOString() : String(c).trim())
const ymd = (c: Cell) => (c instanceof Date ? c.toISOString().slice(0, 10) : text(c).slice(0, 10))
const num = (c: Cell) => (c == null || c === "-" ? 0 : (toNumber(text(c)) ?? 0))
/** "06/05/2026,  17:33" → "17:33" */
const hhmm = (c: Cell) => text(c).match(/(\d{1,2}):(\d{2})/)?.slice(1).map((p) => p.padStart(2, "0")).join(":") ?? ""
/** "PT. HUIXIN INDUSTRY" and "PT HUIXIN INDUSTRY" compare equal. */
const sameName = (name: string) => name.toUpperCase().replace(/^PT\.?\s*/, "").replace(/[^A-Z0-9]/g, "")
const safeId = (s: string) => s.replace(/[^A-Za-z0-9-]/g, "_")
const blank = (row: Cell[]) => row.every((c) => c == null || text(c) === "")

const rowsOf = async (file: File, sheet: string, from: number, to: number) =>
  ((await readSheet(file, sheet)) as Cell[][]).slice(from - 1, to).map((cells, i) => ({ cells, row: from + i })).filter(({ cells }) => !blank(cells))

const KIND_ORDER = { weighing: 0, output: 1, usage: 2 } as const

export async function buildPlan(file: File, db: { materials: Material[]; suppliers: Supplier[]; departments: Department[] }): Promise<Plan> {
  const [suppliers, trucks, washes, recycles, outs] = await Promise.all([
    rowsOf(file, "SUPPLIER", 2, 100),
    rowsOf(file, "TIMBANGAN", 5, 209),
    rowsOf(file, "HASIL CUCI", 5, 133),
    rowsOf(file, "RECYCLE", 5, 95),
    rowsOf(file, "OUT", 7, 735), // row 6 is the English header
  ])

  // 1. Truck weighings. Supplier codes not on the SUPPLIER sheet are matched by name.
  const known = new Map(suppliers.map(({ cells }) => [text(cells[0]), sameName(text(cells[1]))]))
  const remapped: Plan["remapped"] = []
  const renamed: Plan["renamed"] = []
  const seen = new Map<string, number>()
  const weighings: ImportedWeighing[] = trucks.map(({ cells: c, row }) => {
    let supplier = text(c[6])
    if (!known.has(supplier)) {
      const match = [...known].find(([, name]) => name === sameName(text(c[7])))?.[0]
      if (match) {
        remapped.push({ row, from: supplier, to: match, name: text(c[7]) })
        supplier = match
      }
    }
    let number = text(c[1])
    const times = (seen.get(number) ?? 0) + 1
    seen.set(number, times)
    if (times > 1) {
      renamed.push({ row, from: number, to: `${number}-${times}` })
      number = `${number}-${times}`
    }
    return {
      docId: `imp-tm-r${row}`,
      row,
      number,
      date: ymd(c[3]),
      plate: text(c[4]).toUpperCase(),
      container: text(c[5]),
      supplier,
      timeIn: hhmm(c[9]),
      weight1: num(c[10]),
      timeOut: hhmm(c[11]),
      weight2: num(c[12]),
      net: num(c[13]),
      driver: text(c[14]),
      notes: text(c[15]),
      moisture: c[16] == null ? null : toNumber(text(c[16])),
      material: text(c[17]),
      status: "stocked",
      cancelReason: "",
    }
  })

  // 2. Washing / recycling output (the Excel rows have no input; OUT already records what went in).
  const sequence = new Map<string, number>()
  const next = (prefix: string, date: string) => {
    const id = counterId(prefix, date)
    sequence.set(id, (sequence.get(id) ?? 0) + 1)
    return formatDocNumber(prefix, date, sequence.get(id)!)
  }
  const outputs: Output[] = [
    ...washes.map(({ cells: c, row }) => ({ docId: `imp-cc-r${row}`, row, type: "wash" as const, date: ymd(c[2]), material: text(c[3]), qty: num(c[6]) })),
    ...recycles.map(({ cells: c, row }) => ({ docId: `imp-rc-r${row}`, row, type: "recycle" as const, date: ymd(c[2]), material: text(c[3]), qty: num(c[6]) })),
  ]
    .sort((a, b) => a.date.localeCompare(b.date) || a.type.localeCompare(b.type) || a.row - b.row)
    .map((o) => ({ ...o, number: next(o.type === "wash" ? "CC" : "RC", o.date) }))

  // 3. Usage, grouped by date + shift + department; the same material in a group is added up.
  const groups = new Map<string, UsageDoc>()
  for (const { cells: c } of outs) {
    const [date, shift, department, material, qty] = [ymd(c[2]), text(c[3]), text(c[4]).toUpperCase(), text(c[5]), num(c[9])]
    const key = `${date}|${shift}|${department}`
    const doc = groups.get(key) ?? { docId: safeId(`imp-out-${date}-${shift}-${department}`), number: "", date, shift, department, lines: [], total: 0 }
    const line = doc.lines.find((l) => l.material === material)
    if (line) line.qty = round3(line.qty + qty)
    else doc.lines.push({ material, qty })
    doc.total = round3(doc.total + qty)
    groups.set(key, doc)
  }
  const usages = [...groups.values()]
    .sort((a, b) => a.date.localeCompare(b.date) || a.shift.localeCompare(b.shift) || a.department.localeCompare(b.department))
    .map((u) => ({ ...u, number: next("OUT", u.date) }))

  // 4. Order: by day, then weighings → wash/recycle output → usage.
  const events: Event[] = [
    ...weighings.map((w, index) => ({ date: w.date, order: KIND_ORDER.weighing, kind: "weighing" as const, index })),
    ...outputs.map((o, index) => ({ date: o.date, order: KIND_ORDER.output, kind: "output" as const, index })),
    ...usages.map((u, index) => ({ date: u.date, order: KIND_ORDER.usage, kind: "usage" as const, index })),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order)

  // Running stock, to find dips below zero.
  const balance = new Map<string, number>()
  const dips: Plan["dips"] = []
  for (const move of movementsOf({ weighings, outputs, usages, events })) {
    const after = round3((balance.get(move.material) ?? 0) + move.qty)
    balance.set(move.material, after)
    if (after < 0) dips.push({ date: move.date, material: move.material, balance: after })
  }

  // 5. Compare with the monthly sheets: E = begin, F = in, G = out, H = loss, I = balance.
  const differences: Plan["differences"] = []
  const ours = monthlyFigures(movementsOf({ weighings, outputs, usages, events }))
  for (const month of MONTHS) {
    // Monthly sheets are optional: a missing one is simply not cross-checked.
    const sheet = (await rowsOf(file, month, 6, 200).catch(() => [])).filter(({ cells }) => /^BB/.test(text(cells[0])))
    for (const { cells } of sheet) {
      const material = text(cells[0])
      const mine = ours.get(`${month}|${material}`) ?? { begin: 0, in: 0, out: 0, loss: 0, end: 0 }
      const theirs = { begin: num(cells[4]), in: num(cells[5]), out: num(cells[6]), loss: num(cells[7]), end: num(cells[8]) }
      for (const field of ["begin", "in", "out", "loss", "end"] as const) {
        if (Math.abs(mine[field] - theirs[field]) > 0.001) differences.push({ month, material, field, ours: mine[field], sheet: theirs[field] })
      }
    }
  }

  // TM keeps the Excel numbers; new numbers continue after the highest one each month.
  const counters = new Map(sequence)
  for (const w of weighings) {
    const seq = Number(w.number.match(/^TM\/\d\d[A-L](\d{5})/)?.[1] ?? 0)
    const id = counterId("TM", w.date)
    counters.set(id, Math.max(counters.get(id) ?? 0, seq))
  }

  const has = (list: { code: string }[]) => new Set(list.map((x) => x.code))
  const [materialCodes, supplierCodes, departmentCodes] = [has(db.materials), has(db.suppliers), has(db.departments)]
  const used = (values: string[], codes: Set<string>) => [...new Set(values)].filter((v) => v && !codes.has(v)).sort()

  return {
    weighings,
    outputs,
    usages,
    events,
    renamed,
    remapped,
    dips,
    differences,
    missing: {
      materials: used([...weighings.map((w) => w.material), ...outputs.map((o) => o.material), ...usages.flatMap((u) => u.lines.map((l) => l.material))], materialCodes),
      suppliers: used(weighings.map((w) => w.supplier), supplierCodes),
      departments: used(usages.map((u) => u.department), departmentCodes),
    },
    counters: [...counters].map(([id, last]) => ({ id, last })),
  }
}

type Move = Pick<StockMovement, "material" | "date" | "qty" | "kind">

/** The stock movements the plan will create, in import order. */
function movementsOf(plan: Pick<Plan, "weighings" | "outputs" | "usages" | "events">): Move[] {
  return plan.events.flatMap((e): Move[] => {
    if (e.kind === "weighing") {
      const w = plan.weighings[e.index]
      return [{ kind: "receipt", material: w.material, date: w.date, qty: w.net ?? 0 }]
    }
    if (e.kind === "output") {
      const o = plan.outputs[e.index]
      return [{ kind: "processIn", material: o.material, date: o.date, qty: o.qty }]
    }
    const u = plan.usages[e.index]
    return u.lines.map((l) => ({ kind: "usage" as StockKind, material: l.material, date: u.date, qty: -l.qty }))
  })
}

/** Begin / in / out / loss / end per month and material, the way the monthly sheets count them. */
function monthlyFigures(moves: Move[]) {
  const figures = new Map<string, { begin: number; in: number; out: number; loss: number; end: number }>()
  const running = new Map<string, number>()
  for (const month of MONTHS) {
    for (const material of new Set(moves.map((m) => m.material))) {
      const begin = running.get(material) ?? 0
      const these = moves.filter((m) => m.material === material && m.date.startsWith(month))
      const inQty = round3(these.filter((m) => m.qty > 0).reduce((s, m) => s + m.qty, 0))
      const outQty = round3(-these.filter((m) => m.qty < 0).reduce((s, m) => s + m.qty, 0))
      const end = round3(begin + inQty - outQty)
      figures.set(`${month}|${material}`, { begin, in: inQty, out: outQty, loss: 0, end })
      running.set(material, end)
    }
  }
  return figures
}

/** Writes everything (resuming if a previous run stopped), closes May–September and marks the import done. */
export async function runImport(
  plan: Plan,
  db: { materials: Material[]; departments: Department[] },
  onProgress: (done: number, total: number) => void
) {
  const by = { uid: auth.currentUser!.uid, email: auth.currentUser!.email }

  await transaction(async (w) => {
    const marker = await w.get<{ status: string }>(IMPORT_DOC.path, IMPORT_DOC.id)
    if (marker?.status === "done") throw new Error("Impor riwayat gudang sudah pernah dijalankan.")
    if (!marker) await w.set(IMPORT_DOC.path, IMPORT_DOC.id, { status: "running", by, startedAt: serverTimestamp() })
  })

  const total = plan.events.length
  for (const [i, event] of plan.events.entries()) {
    await transaction(
      async (w) => {
        if (event.kind === "weighing") {
          const { docId, ...weighing } = plan.weighings[event.index]
          const doc: Partial<typeof weighing> = { ...weighing }
          delete doc.row
          if (await w.get(WEIGHINGS, docId)) return // already imported in an earlier run
          await w.set(WEIGHINGS, docId, { ...doc, imported: true })
          await addStock(w, { kind: "receipt", material: weighing.material, date: weighing.date, qty: weighing.net ?? 0, source: { type: "weighing", id: docId, number: weighing.number } }, { allowNegative: true })
        } else if (event.kind === "output") {
          const o = plan.outputs[event.index]
          if (await w.get(PROCESSINGS, o.docId)) return
          await w.set(PROCESSINGS, o.docId, {
            number: o.number, type: o.type, date: o.date, inputs: [], output: o.material,
            wetWeight: o.qty, cleanWeight: o.qty, shrinkage: 0, shrinkagePct: 0, reason: "", imported: true,
          })
          await addStock(w, { kind: "processIn", material: o.material, date: o.date, qty: o.qty, source: { type: "processing", id: o.docId, number: o.number } }, { allowNegative: true })
        } else {
          const u = plan.usages[event.index]
          if (await w.get(USAGES, u.docId)) return
          const { docId, ...doc } = u
          await w.set(USAGES, docId, { ...doc, imported: true })
          for (const line of u.lines) {
            await addStock(w, { kind: "usage", material: line.material, date: u.date, qty: -line.qty, source: { type: "usage", id: docId, number: u.number } }, { allowNegative: true })
          }
        }
      },
      { silent: true }
    )
    onProgress(i + 1, total)
  }

  // New document numbers continue after the imported ones.
  await transaction(async (w) => {
    for (const c of plan.counters) await w.set("counters", c.id, { last: c.last })
  }, { silent: true })

  // Close May–September with the imported figures (each month's Begin = previous End).
  const moves = movementsOf(plan) as StockMovement[]
  let previous: MonthRow[] | undefined
  for (const month of MONTHS) {
    const rows = monthRows(db.materials, db.departments, moves.filter((m) => m.date.startsWith(month)), previous ? { closed: previous } : { earlier: [] })
    await transaction(async (w) => {
      if (!(await w.get(PERIODS, month))) await w.set(PERIODS, month, { rows, closedBy: by, closedAt: serverTimestamp() })
    })
    previous = rows
  }

  const summary = {
    weighings: plan.weighings.length,
    washes: plan.outputs.filter((o) => o.type === "wash").length,
    recycles: plan.outputs.filter((o) => o.type === "recycle").length,
    usages: plan.usages.length,
    movements: moves.length,
    renamed: plan.renamed.length,
    remapped: plan.remapped.length,
    dips: plan.dips.length,
    differences: plan.differences.length,
    monthsClosed: MONTHS,
  }
  await transaction((w) => w.update(IMPORT_DOC.path, IMPORT_DOC.id, { status: "done", summary, finishedAt: serverTimestamp() }))
  return summary
}
