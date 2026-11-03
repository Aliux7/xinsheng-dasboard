import { serverTimestamp } from "firebase/firestore"

import {
  ACCOUNTING_PERIODS,
  BANK_RECS,
  BANKS,
  DEFAULT_BANKS,
  JOURNAL_SOURCES,
  JOURNALS,
  type Account,
  type AccountingPeriod,
  type Bank,
  type BankId,
  type BankRec,
  type Journal,
  type JournalLine,
} from "@/lib/collections"
import { transaction, type Writer } from "@/lib/db"
import { auth } from "@/lib/firebase"
import { monthOf } from "@/lib/period"

/** Rupiah to the cent. */
export const round2 = (n: number) => Math.round(n * 100) / 100

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"]
const pad4 = (n: number) => String(n).padStart(4, "0")

/** The bank (`banks/{code}`, or the built-in list while it is empty), read inside the transaction. */
export async function bankOf(w: Writer, id: BankId) {
  const bank = (await w.get<Bank>(BANKS, id)) ?? DEFAULT_BANKS.find((b) => b.code === id)
  if (!bank) throw new Error(`Bank ${id} tidak ditemukan.`)
  if (!bank.account) throw new Error(`Bank ${bank.name} belum punya nomor akun.`)
  return bank
}

/** "Manual", "Sales"… or the bank's name for a bank entry. */
export function sourceLabel(source: string, banks: Pick<Bank, "code" | "name">[]) {
  return JOURNAL_SOURCES[source as keyof typeof JOURNAL_SOURCES] ?? banks.find((b) => b.code === source)?.name ?? source
}

export const emptyLine = (): JournalLine => ({
  account: "",
  description: "",
  descriptionZh: "",
  currency: "IDR",
  amount: null,
  rate: null,
  debit: 0,
  credit: 0,
  note: "",
})

export function totalsOf(lines: JournalLine[]) {
  const debit = round2(lines.reduce((s, l) => s + (l.debit || 0), 0))
  const credit = round2(lines.reduce((s, l) => s + (l.credit || 0), 0))
  return { debit, credit, difference: round2(debit - credit) }
}

/** Why an entry can't be saved yet, or null. */
export function entryError(lines: JournalLine[]) {
  const used = lines.filter((l) => l.account || l.debit || l.credit)
  if (used.length < 2) return "Jurnal perlu minimal dua baris."
  for (const [i, l] of used.entries()) {
    if (!l.account) return `Baris ${i + 1}: pilih akun.`
    if (l.debit && l.credit) return `Baris ${i + 1}: isi debit atau kredit, tidak keduanya.`
    if (!l.debit && !l.credit) return `Baris ${i + 1}: isi debit atau kredit.`
    if (l.debit < 0 || l.credit < 0) return `Baris ${i + 1}: jumlah tidak boleh negatif.`
  }
  const { difference } = totalsOf(used)
  if (difference) return `Debit dan kredit belum seimbang (selisih ${difference.toLocaleString("id-ID")}).`
  return null
}

/** A closed month accepts no new entries and no reversals. */
export async function ensureAccountingOpen(w: Writer, date: string) {
  const period = await w.get<AccountingPeriod>(ACCOUNTING_PERIODS, monthOf(date))
  if (period?.status === "closed") throw new Error(`Periode akuntansi ${monthOf(date)} sudah ditutup.`)
}

async function next(w: Writer, counter: string) {
  const last = (await w.get<{ last: number }>("counters", counter))?.last ?? 0
  await w.set("counters", counter, { last: last + 1 }, { silent: true })
  return last + 1
}

/** Manual entries: JV-0001/X/26 (per month). */
export async function jvNumber(w: Writer, date: string) {
  const [y, m] = date.split("-")
  return `JV-${pad4(await next(w, `JV-${y}-${m}`))}/${ROMAN[Number(m) - 1]}/${y.slice(2)}`
}

/** Bank vouchers: BBM.26.10.0001 (in) / BBK.26.10.0001 (out), counted per bank per month. */
export async function bankNumber(w: Writer, bank: BankId, kind: "BBM" | "BBK", date: string) {
  const [y, m] = date.split("-")
  return `${kind}.${y.slice(2)}.${m}.${pad4(await next(w, `${kind}-${bank}-${y}-${m}`))}`
}

export type EntryInput = Pick<Journal, "date" | "source" | "counterparty" | "description" | "lines">

function entry(input: EntryInput, number: string): Omit<Journal, "id"> {
  const lines = input.lines
    .filter((l) => l.account || l.debit || l.credit)
    .map((l) => ({ ...l, debit: round2(l.debit || 0), credit: round2(l.credit || 0) }))
  const { debit, credit, difference } = totalsOf(lines)
  return {
    ...input,
    number,
    lines,
    totalDebit: debit,
    totalCredit: credit,
    accounts: [...new Set(lines.map((l) => l.account))],
    balanced: !difference,
  }
}

/** Writes one balanced entry inside a transaction; documents (invoices, payments…) use this for their journal. */
export async function post(w: Writer, input: EntryInput, number: (w: Writer) => Promise<string>, extra: Partial<Journal> = {}) {
  const problem = entryError(input.lines)
  if (problem) throw new Error(problem)
  await ensureAccountingOpen(w, input.date)
  const id = w.newId(JOURNALS)
  const saved = { ...entry(input, await number(w)), ...extra }
  await w.set(JOURNALS, id, saved)
  return { id, ...saved }
}

/** Manual entry (Jurnal umum). */
export function saveJournal(input: EntryInput) {
  return transaction((w) => post(w, input, (w) => jvNumber(w, input.date)))
}

/** "Buat jurnal balik": a new manual entry with debit and credit swapped. */
export function reverseJournal(original: Journal, date: string) {
  return transaction((w) => reverseIn(w, original, date))
}

/** Reversal inside an open transaction, e.g. when a document is cancelled; `extra` links it (e.g. `document`). */
export async function reverseIn(w: Writer, original: Journal, date: string, extra: Partial<Journal> = {}) {
  const current = await w.get<Journal>(JOURNALS, original.id)
  if (current?.reversedBy) throw new Error(`${original.number} sudah dibalik.`)
  await ensureAccountingOpen(w, original.date)
  const reversal = await post(
    w,
    {
      date,
      source: "manual",
      counterparty: original.counterparty,
      description: `Jurnal balik ${original.number}${original.description ? `: ${original.description}` : ""}`,
      // Swap sides; the reversal is dated on its own date, so per-line import dates are dropped.
      lines: original.lines.map((l) => {
        const swapped = { ...l, debit: l.credit, credit: l.debit }
        delete swapped.date
        return swapped
      }),
    },
    (w) => jvNumber(w, date),
    { reverses: original.id, ...extra }
  )
  await w.update(JOURNALS, original.id, { reversedBy: reversal.id })
  return reversal
}

/** Bank quick entry: money in (BBM) or out (BBK), bank account vs one contra account. */
export function saveBankEntry(input: {
  bank: BankId
  date: string
  name: string
  description: string
  contra: string
  direction: "in" | "out"
  amount: number
}) {
  const line = (account: string, debit: number, credit: number) => ({ ...emptyLine(), account, description: input.description, debit, credit })
  return transaction(async (w) => {
    const bankAccount = (await bankOf(w, input.bank)).account
    const lines =
      input.direction === "in"
        ? [line(bankAccount, input.amount, 0), line(input.contra, 0, input.amount)]
        : [line(input.contra, input.amount, 0), line(bankAccount, 0, input.amount)]
    return post(w, { date: input.date, source: input.bank, counterparty: input.name, description: input.description, lines }, (w) =>
      bankNumber(w, input.bank, input.direction === "in" ? "BBM" : "BBK", input.date)
    )
  })
}

/** Transfer between own banks: one entry, BBK number of the sending bank. */
export function saveTransfer(input: { from: BankId; to: BankId; date: string; amount: number; description: string }) {
  if (input.from === input.to) throw new Error("Pilih dua rekening bank yang berbeda.")
  return transaction(async (w) => {
    const from = await bankOf(w, input.from)
    const to = await bankOf(w, input.to)
    const description = input.description || `Transfer ${from.name} → ${to.name}`
    const lines = [
      { ...emptyLine(), account: to.account, description, debit: input.amount },
      { ...emptyLine(), account: from.account, description, credit: input.amount },
    ]
    return post(w, { date: input.date, source: input.from, counterparty: to.name, description, lines }, (w) =>
      bankNumber(w, input.from, "BBK", input.date)
    )
  })
}

/** One journal line with its entry, for ledgers and bank books. */
export type LedgerLine = { journal: Journal; index: number; line: JournalLine; date: string; key: string }

/** Every line on `account`, in date then number order. */
export function linesOf(journals: Journal[], account: string): LedgerLine[] {
  return journals
    .flatMap((journal) =>
      journal.lines.flatMap((line, index) =>
        line.account === account ? [{ journal, index, line, date: line.date ?? journal.date, key: `${journal.id}:${index}` }] : []
      )
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.journal.number.localeCompare(b.journal.number, undefined, { numeric: true }) || a.index - b.index)
}

/** +1 when the account grows on the debit side, −1 when on the credit side. */
export const signOf = (account?: Account) => (account?.normalBalance === "credit" ? -1 : 1)

/** The other accounts on an entry (the "contra" of a bank line). */
export const contraOf = (l: LedgerLine) =>
  [...new Set(l.journal.lines.filter((_, i) => i !== l.index).map((x) => x.account))].join(", ")

export type TrialRow = { account: string; name: string; openD: number; openC: number; moveD: number; moveC: number; endD: number; endC: number }

const sides = (net: number) => (net >= 0 ? [round2(net), 0] : [0, round2(-net)])

/** Trial balance from `from` (inclusive) to `to` (exclusive), every account in `accounts`. */
export function trialBalance(journals: Journal[], accounts: Account[], from: string, to: string): TrialRow[] {
  const sums = new Map<string, { open: number; d: number; c: number }>()
  for (const j of journals) {
    for (const l of j.lines) {
      const date = l.date ?? j.date
      if (date >= to) continue
      const s = sums.get(l.account) ?? { open: 0, d: 0, c: 0 }
      if (date < from) s.open = round2(s.open + l.debit - l.credit)
      else {
        s.d = round2(s.d + l.debit)
        s.c = round2(s.c + l.credit)
      }
      sums.set(l.account, s)
    }
  }
  const codes = [...new Set([...accounts.map((a) => a.code), ...sums.keys()])].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  return codes.map((code) => {
    const s = sums.get(code) ?? { open: 0, d: 0, c: 0 }
    const [openD, openC] = sides(s.open)
    const [endD, endC] = sides(s.open + s.d - s.c)
    return { account: code, name: accounts.find((a) => a.code === code)?.nameId ?? "", openD, openC, moveD: s.d, moveC: s.c, endD, endC }
  })
}

/**
 * Reconciliation difference: statement + money in not yet on the statement
 * − money out not yet on the statement − book closing balance. 0 = reconciled.
 */
export function reconciliation(lines: LedgerLine[], bookEnd: number, statement: number | null, cleared: Set<string>) {
  const open = lines.filter((l) => !cleared.has(l.key))
  const unclearedIn = round2(open.reduce((s, l) => s + l.line.debit, 0))
  const unclearedOut = round2(open.reduce((s, l) => s + l.line.credit, 0))
  const difference = statement == null ? null : round2(statement + unclearedIn - unclearedOut - bookEnd)
  return { unclearedIn, unclearedOut, difference }
}

/** Saves a bank's reconciliation for one month (`bankRecs/{bank}-{YYYY-MM}`). */
export function saveBankRec(rec: Omit<BankRec, "id">) {
  return transaction(async (w) => {
    await ensureAccountingOpen(w, `${rec.month}-01`)
    await w.set(BANK_RECS, `${rec.bank}-${rec.month}`, rec)
  })
}

/** Closes an accounting month: no entry dated in it can be added or reversed afterwards. */
export function closeAccountingMonth(month: string) {
  return transaction(async (w) => {
    const current = await w.get<AccountingPeriod>(ACCOUNTING_PERIODS, month)
    if (current?.status === "closed") throw new Error(`Periode ${month} sudah ditutup.`)
    await w.set(ACCOUNTING_PERIODS, month, {
      ...current,
      status: "closed",
      closedBy: { uid: auth.currentUser!.uid, email: auth.currentUser!.email },
      closedAt: serverTimestamp(),
    })
  })
}

/** Admin only (enforced by firestore.rules); the reason is kept on the period and in the change log. */
export function reopenAccountingMonth(month: string, reason: string) {
  return transaction(async (w) => {
    const current = await w.get<AccountingPeriod>(ACCOUNTING_PERIODS, month)
    if (current?.status !== "closed") throw new Error(`Periode ${month} tidak sedang ditutup.`)
    await w.update(ACCOUNTING_PERIODS, month, {
      status: "open",
      reopenedBy: { uid: auth.currentUser!.uid, email: auth.currentUser!.email },
      reopenedAt: serverTimestamp(),
      reopenReason: reason,
    })
  })
}
