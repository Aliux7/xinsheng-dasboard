import { serverTimestamp } from "firebase/firestore"
import { readSheet } from "read-excel-file/browser"

import { ACCOUNTING_PERIODS, JOURNALS, type Account, type Journal, type JournalLine, type JournalSource } from "@/lib/collections"
import { transaction } from "@/lib/db"
import { auth } from "@/lib/firebase"
import type { TemplateSheet } from "@/lib/excel-template"
import { round2 } from "@/lib/journal"
import { toNumber } from "@/lib/utils"

/**
 * One-time import of the 2025 journal from FINANCIAL STATEMENT 2025 (PT) Combine.xlsx,
 * sheet JURNAL rows 44–2045. Lines with the same Source (C) and Doc. No (F) form one
 * entry; the two transfer lines without a number are combined. Original numbers, dates,
 * partners, currencies and notes are kept. Then September–December 2025 are closed.
 */
export const JOURNAL_IMPORT_DOC = { path: "imports", id: "journal-2025" }
export const CLOSE_MONTHS = ["2025-09", "2025-10", "2025-11", "2025-12"]

const SOURCES: Record<string, JournalSource> = {
  "Bank BCA1 (PT)": "bca1",
  "Bank 2": "bca2",
  "Bank 3": "bca3",
  "Purchase Invoice": "purchase",
  "Sales Invoice": "sales",
  "General Ledger": "gl",
}

/** The columns `buildJournalPlan` reads from sheet JURNAL. */
export const JOURNAL_TEMPLATE: TemplateSheet[] = [
  {
    name: "JURNAL",
    headerRow: 43,
    lastRow: 2045,
    note: `Sumber diisi salah satu: ${Object.keys(SOURCES).join(", ")}. Isi Debit atau Kredit (baris dengan keduanya 0 dilewati). Baris dengan Sumber + No. dokumen yang sama menjadi satu jurnal.`,
    columns: [
      { col: "C", header: "Sumber", required: true, example: "General Ledger" },
      { col: "E", header: "Tanggal", required: true, example: "2025-09-30" },
      { col: "F", header: "No. dokumen", required: true, example: "JV-0001/IX/25" },
      { col: "G", header: "Partner", example: "PT CONTOH JAYA" },
      { col: "H", header: "Akun", required: true, example: "101101" },
      { col: "K", header: "Keterangan", example: "Setoran modal" },
      { col: "L", header: "Keterangan Mandarin" },
      { col: "M", header: "Mata uang", example: "IDR" },
      { col: "O", header: "Jumlah valas" },
      { col: "P", header: "Kurs" },
      { col: "Q", header: "Debit", required: true, example: "1000000" },
      { col: "R", header: "Kredit", required: true, example: "0" },
      { col: "S", header: "Catatan" },
    ],
  },
]

type Cell = string | number | boolean | Date | null
type Entry = Omit<Journal, "id"> & { rows: number[] }

export type JournalPlan = {
  entries: Entry[]
  lines: number
  skippedZero: number
  totalDebit: number
  totalCredit: number
  /** Entries that don't balance in Excel; imported flagged. */
  unbalanced: { number: string; source: string; difference: number }[]
  missingAccounts: string[]
  unknownSources: string[]
  /** The no-number lines combined into one entry. */
  combined: string[]
}

const text = (c: Cell) => (c == null ? "" : c instanceof Date ? c.toISOString() : String(c).trim())
const ymd = (c: Cell) => (c instanceof Date ? c.toISOString().slice(0, 10) : text(c).slice(0, 10))
const num = (c: Cell) => (c == null || c === "" ? 0 : (toNumber(text(c)) ?? 0))

export async function buildJournalPlan(file: File, accounts: Account[]): Promise<JournalPlan> {
  const rows = (await readSheet(file, "JURNAL")) as Cell[][]
  const groups = new Map<string, { source: string; doc: string; lines: { row: number; source: string; date: string; partner: string; line: JournalLine }[] }>()
  let lines = 0
  let skippedZero = 0

  rows.slice(43, 2045).forEach((c, i) => {
    const row = i + 44
    if (!text(c[2]) && !text(c[7])) return // empty row
    const debit = round2(num(c[16]))
    const credit = round2(num(c[17]))
    if (!debit && !credit) return void skippedZero++
    lines++
    const source = text(c[2])
    const doc = text(c[5])
    const date = ymd(c[4])
    // Lines without a number (the bank transfer) are grouped by source-less date, so both sides meet.
    const key = doc ? `${source}|${doc}` : `nodoc|${date}`
    const group = groups.get(key) ?? { source, doc, lines: [] }
    group.lines.push({
      row,
      source,
      date,
      partner: text(c[6]),
      line: {
        account: text(c[7]),
        description: text(c[10]),
        descriptionZh: text(c[11]),
        currency: text(c[12]) || "IDR",
        amount: c[14] == null ? null : num(c[14]),
        rate: c[15] == null ? null : num(c[15]),
        debit,
        credit,
        note: text(c[18]),
      },
    })
    groups.set(key, group)
  })

  const combined: string[] = []
  const entries: Entry[] = [...groups.values()].map((g) => {
    const date = g.lines.map((l) => l.date).sort()[0]
    const entryLines = g.lines.map((l) => (l.date === date ? l.line : { ...l.line, date: l.date }))
    const totalDebit = round2(entryLines.reduce((s, l) => s + l.debit, 0))
    const totalCredit = round2(entryLines.reduce((s, l) => s + l.credit, 0))
    if (!g.doc) combined.push(...g.lines.map((l) => `baris ${l.row} (${l.source}): akun ${l.line.account} ${l.line.debit ? `D ${l.line.debit}` : `K ${l.line.credit}`}`))
    // A combined transfer takes the source of its credit (sending) side.
    const source = g.doc ? g.source : (g.lines.find((l) => l.line.credit) ?? g.lines[0]).source
    return {
      number: g.doc || `TRF.${date.slice(2, 4)}.${date.slice(5, 7)}.${date.slice(8, 10)}`,
      date,
      source: SOURCES[source] ?? "gl",
      counterparty: g.lines.find((l) => l.partner)?.partner ?? "",
      description: g.lines.find((l) => l.line.description)?.line.description ?? "",
      lines: entryLines,
      totalDebit,
      totalCredit,
      accounts: [...new Set(entryLines.map((l) => l.account))],
      balanced: totalDebit === totalCredit,
      imported: true,
      rows: g.lines.map((l) => l.row),
    }
  })
  entries.sort((a, b) => a.date.localeCompare(b.date) || a.number.localeCompare(b.number, undefined, { numeric: true }))

  const known = new Set(accounts.map((a) => a.code))
  return {
    entries,
    lines,
    skippedZero,
    totalDebit: round2(entries.reduce((s, e) => s + e.totalDebit, 0)),
    totalCredit: round2(entries.reduce((s, e) => s + e.totalCredit, 0)),
    unbalanced: entries.filter((e) => !e.balanced).map((e) => ({ number: e.number, source: e.source, difference: round2(e.totalDebit - e.totalCredit) })),
    missingAccounts: [...new Set(entries.flatMap((e) => e.accounts))].filter((a) => !known.has(a)).sort(),
    unknownSources: [...new Set([...groups.values()].map((g) => g.source))].filter((s) => !SOURCES[s]),
    combined,
  }
}

/** Writes the entries in chunks (resuming if stopped), closes Sep–Dec 2025 and marks the import done. */
export async function runJournalImport(plan: JournalPlan, onProgress: (done: number, total: number) => void) {
  const by = { uid: auth.currentUser!.uid, email: auth.currentUser!.email }
  await transaction(async (w) => {
    const marker = await w.get<{ status: string }>(JOURNAL_IMPORT_DOC.path, JOURNAL_IMPORT_DOC.id)
    if (marker?.status === "done") throw new Error("Impor jurnal 2025 sudah pernah dijalankan.")
    if (!marker) await w.set(JOURNAL_IMPORT_DOC.path, JOURNAL_IMPORT_DOC.id, { status: "running", by, startedAt: serverTimestamp() })
  })

  const CHUNK = 50
  for (let i = 0; i < plan.entries.length; i += CHUNK) {
    const chunk = plan.entries.slice(i, i + CHUNK)
    await transaction(
      async (w) => {
        const ids = chunk.map((_, j) => `imp25-${String(i + j + 1).padStart(4, "0")}`)
        const exists = await Promise.all(ids.map((id) => w.get(JOURNALS, id)))
        for (const [j, entry] of chunk.entries()) {
          const doc: Partial<Entry> = { ...entry }
          delete doc.rows
          if (!exists[j]) await w.set(JOURNALS, ids[j], doc)
        }
      },
      { silent: true }
    )
    onProgress(Math.min(i + CHUNK, plan.entries.length), plan.entries.length)
  }

  for (const month of CLOSE_MONTHS) {
    await transaction(async (w) => {
      const current = await w.get<{ status: string }>(ACCOUNTING_PERIODS, month)
      if (current?.status !== "closed") await w.set(ACCOUNTING_PERIODS, month, { status: "closed", closedBy: by, closedAt: serverTimestamp() })
    })
  }

  const summary = {
    entries: plan.entries.length,
    lines: plan.lines,
    totalDebit: plan.totalDebit,
    totalCredit: plan.totalCredit,
    unbalanced: plan.unbalanced.map((u) => u.number),
    monthsClosed: CLOSE_MONTHS,
  }
  await transaction((w) => w.update(JOURNAL_IMPORT_DOC.path, JOURNAL_IMPORT_DOC.id, { status: "done", summary, finishedAt: serverTimestamp() }))
  return summary
}
