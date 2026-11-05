import { LINKS, checkStockLines, type StockLine } from "@/lib/account-links"
import { ACCOUNTS, type Account, type AccountLink } from "@/lib/accounts"
import { BANKS, BANK_TRANSACTIONS, round2, type Bank, type BankTransaction } from "@/lib/bank-book"
import { transaction, type Writer } from "@/lib/db"

/**
 * Journals: `journals/{id}`, each balanced (debits = credits), from four sources (`source.kind`):
 *  - bank: one voucher of the Buku bank (rows sharing a BBM/BBK number) = one journal, the bank's account
 *    against the contra account chosen on each row; its rows are locked until the journal is cancelled.
 *  - manual: Jurnal umum, numbered JV.YY.MM.NNNN (counter `counters/JV-YYYY-MM`).
 *  - opening: Saldo awal, one journal with the fixed id OPENING_ID; a Developer may keep a separate test
 *    one (OPENING_TEST_ID) that the Data uji cleanup removes, so testing never overwrites the real one.
 *  - cogs: HPP bulanan, one per month with the id `HPP-YYYY-MM` (`lib/costing.ts`).
 * Journals are never edited; cancelling deletes them (the change log keeps them). Docs in `journals` from
 * the removed version have no `total`: `isLedgerJournal` leaves them out.
 * A contra account with a link (`lib/account-links.ts`) needs its data on the row (e.g. items for
 * inventory) and journaling / cancelling applies / reverses the link's effect in the same transaction.
 */
export const JOURNALS = "journals"

export type JournalLine = { account: string; description: string; debit: number; credit: number }

export type Journal = {
  id: string
  /** YYYY-MM-DD */
  date: string
  /** The voucher number, e.g. BBK.26.01.0001. */
  number: string
  description: string
  lines: JournalLine[]
  /** Account codes in `lines`, for `array-contains` queries (Buku besar). */
  accounts: string[]
  /** Sum of the debits (= sum of the credits). */
  total: number
  source: JournalSource
  /** Rows whose link effect was applied (e.g. stock moved), so a cancel reverses exactly those. */
  links?: { row: string; link: AccountLink }[]
  /** HPP bulanan: the figures it was posted with (`lib/costing.ts`). */
  cogs?: Record<string, number>
}

export type JournalSource =
  | { kind: "bank"; bank: string; rows: string[] }
  | { kind: "manual" }
  | { kind: "opening" }
  | { kind: "cogs"; month: string }

export const SOURCE_LABELS: Record<JournalSource["kind"], string> = { bank: "Buku bank", manual: "Jurnal umum", opening: "Saldo awal", cogs: "HPP bulanan" }

/** Journals of this version (the removed version's docs in `journals` have no `total`). */
export const isLedgerJournal = (j: Partial<Journal>) => typeof j.total === "number" && !!j.source && typeof j.source === "object" && j.source.kind in SOURCE_LABELS

export const OPENING_ID = "SALDO-AWAL"
export const OPENING_TEST_ID = "SALDO-AWAL-UJI"

/** Bank rows of one voucher, oldest first. Opening balances (no number) are not journaled here. */
export type Voucher = { key: string; number: string; rows: BankTransaction[] }

export function vouchersOf(rows: BankTransaction[]): Voucher[] {
  const map = new Map<string, Voucher>()
  for (const r of rows) {
    if (r.opening || !r.number) continue
    const key = `${r.bank}|${r.number}`
    const v = map.get(key) ?? { key, number: r.number, rows: [] }
    v.rows.push(r)
    map.set(key, v)
  }
  return [...map.values()]
}

/** Link of each account code (null = not connected). */
export type LinkOf = (account: string) => AccountLink | null | undefined

/** Why the voucher can't be journaled yet, or null when it can. */
export function voucherProblem(v: Voucher, bankAccount: string | undefined, linkOf: LinkOf) {
  if (v.rows.some((r) => r.journal)) return "Sudah dijurnal"
  if (!bankAccount) return "Rekening belum dihubungkan ke akun"
  const missing = v.rows.filter((r) => !r.contra).length
  if (missing) return `${missing} baris belum ada akun lawan`
  if (v.rows.some((r) => r.contra === bankAccount)) return "Akun lawan sama dengan akun bank ini"
  for (const r of v.rows) {
    const link = linkOf(r.contra!)
    const problem = link && LINKS[link].problem(r)
    if (problem) return v.rows.length > 1 ? `${problem} (${r.description})` : problem
  }
  return null
}

/**
 * Money in: debit bank, credit the contra; money out: the other way. The contra lines keep each row's
 * text; the bank gets one line with the voucher's net (none when it nets to zero).
 */
export function linesOf(rows: BankTransaction[], bankAccount: string): JournalLine[] {
  const text = (r: BankTransaction) => [...new Set([r.name, r.description].filter(Boolean))].join(" · ")
  const contra = rows.map((r) => ({
    account: r.contra!,
    description: text(r),
    debit: r.amount < 0 ? -r.amount : 0,
    credit: r.amount > 0 ? r.amount : 0,
  }))
  const net = round2(rows.reduce((s, r) => s + r.amount, 0))
  const bank = net ? [{ account: bankAccount, description: rows.length === 1 ? text(rows[0]) : rows[0].number, debit: Math.max(net, 0), credit: Math.max(-net, 0) }] : []
  return [...bank, ...contra]
}

/** Sets (or clears, with "") the contra account of not yet journaled rows; item lines go when it isn't an inventory account. */
export function setContra(rowIds: string[], account: string) {
  return transaction(async (w) => {
    const a = account ? await w.get<Account>(ACCOUNTS, account) : undefined
    if (account && !a?.active) throw new Error(`Akun ${account} tidak ada atau tidak aktif.`)
    for (const id of rowIds) {
      const row = await w.get<BankTransaction>(BANK_TRANSACTIONS, id)
      if (!row) throw new Error("Baris buku bank tidak ditemukan.")
      if (row.journal) throw new Error(`${row.number} sudah dijurnal; batalkan jurnalnya dulu.`)
      await w.update(BANK_TRANSACTIONS, id, { contra: account, ...(a?.link !== "inventory" && row.stock?.length && { stock: [] }) })
    }
    return rowIds.length
  })
}

/** Items and quantities of a not yet journaled row whose contra is an inventory account. */
export function setRowStock(rowId: string, lines: StockLine[]) {
  return transaction(async (w) => {
    const row = await w.get<BankTransaction>(BANK_TRANSACTIONS, rowId)
    if (!row) throw new Error("Baris buku bank tidak ditemukan.")
    if (row.journal) throw new Error(`${row.number} sudah dijurnal; batalkan jurnalnya dulu.`)
    const a = row.contra ? await w.get<Account>(ACCOUNTS, row.contra) : undefined
    if (a?.link !== "inventory") throw new Error("Akun lawan baris ini tidak terhubung ke inventory.")
    const stock = await checkStockLines(w, lines, row.amount, row.contra!)
    await w.update(BANK_TRANSACTIONS, rowId, { stock })
    return stock.length
  })
}

/** One journal per voucher; every row of each voucher needs a contra account. Returns the count. */
export function journalVouchers(bankId: string, vouchers: { number: string; rowIds: string[] }[]) {
  return transaction(async (w) => {
    const bank = await w.get<Bank>(BANKS, bankId)
    if (!bank?.accountCode) throw new Error("Hubungkan rekening bank ke akunnya dulu.")
    for (const v of vouchers) {
      const rows: BankTransaction[] = []
      for (const id of v.rowIds) {
        const row = await w.get<BankTransaction>(BANK_TRANSACTIONS, id)
        if (!row) throw new Error(`Baris ${v.number} tidak ditemukan.`)
        rows.push({ ...row, id })
      }
      const accounts = new Map<string, Account>()
      for (const code of new Set(rows.map((r) => r.contra).filter((c): c is string => !!c))) {
        const a = await w.get<Account>(ACCOUNTS, code)
        if (!a?.active) throw new Error(`${v.number}: akun ${code} tidak ada atau tidak aktif.`)
        accounts.set(code, a)
      }
      const linkOf: LinkOf = (code) => accounts.get(code)?.link
      const problem = voucherProblem({ key: v.number, number: v.number, rows }, bank.accountCode, linkOf)
      if (problem) throw new Error(`${v.number}: ${problem}.`)

      const lines = linesOf(rows, bank.accountCode)
      const total = round2(lines.reduce((s, l) => s + l.debit, 0))
      if (total !== round2(lines.reduce((s, l) => s + l.credit, 0))) throw new Error(`${v.number}: jurnal tidak seimbang.`)
      const id = w.newId(JOURNALS)
      const journal: Omit<Journal, "id"> = {
        date: rows.map((r) => r.date).sort()[0],
        number: v.number,
        description: rows.length === 1 ? rows[0].description : `${bank.name} ${v.number} (${rows.length} baris)`,
        lines,
        accounts: [...new Set(lines.map((l) => l.account))],
        total,
        source: { kind: "bank", bank: bankId, rows: rows.map((r) => r.id) },
        links: rows.flatMap((r) => {
          const link = linkOf(r.contra!)
          return link ? [{ row: r.id, link }] : []
        }),
      }
      await w.set(JOURNALS, id, journal)
      for (const r of rows) {
        await w.update(BANK_TRANSACTIONS, r.id, { journal: id })
        const link = linkOf(r.contra!)
        if (link) await LINKS[link].apply(w, r, { id, number: v.number })
      }
    }
    return vouchers.length
  })
}

/**
 * Deletes the journal. A bank journal unlocks its rows (their contra accounts stay, ready to journal
 * again) and reverses linked effects (e.g. stock moved back); an HPP month can't go while the next month's
 * HPP is posted.
 */
export function cancelJournal(id: string) {
  return transaction(async (w) => {
    const journal = await w.get<Journal>(JOURNALS, id)
    if (!journal) throw new Error("Jurnal tidak ditemukan.")
    if (journal.source.kind === "cogs") {
      const [y, m] = journal.source.month.split("-").map(Number)
      const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`
      if (await w.get(JOURNALS, `HPP-${next}`)) throw new Error(`Batalkan dulu HPP ${next}.`)
    }
    const rows = journal.source.kind === "bank" ? journal.source.rows : []
    for (const rowId of rows) {
      const row = await w.get<BankTransaction>(BANK_TRANSACTIONS, rowId)
      if (!row) continue
      const link = journal.links?.find((l) => l.row === rowId)?.link
      if (link) await LINKS[link].undo(w, { ...row, id: rowId }, { id, number: journal.number })
      await w.update(BANK_TRANSACTIONS, rowId, { journal: null })
    }
    await w.remove(JOURNALS, id)
    return journal.number
  })
}

export type LineInput = { account: string; description: string; debit: number | null; credit: number | null }

/**
 * Checks lines typed by a person (Jurnal umum, Saldo awal) inside the transaction: accounts exist and are
 * active, each line is a debit or a credit, debits = credits. `allowStock` lets inventory accounts in
 * (only Saldo awal: their value otherwise moves with the stock). Returns the lines and the total.
 */
async function checkLines(w: Writer, input: LineInput[], allowStock: boolean) {
  const lines: JournalLine[] = input
    .filter((l) => l.account && ((l.debit ?? 0) > 0 || (l.credit ?? 0) > 0))
    .map((l) => ({ account: l.account, description: l.description.trim(), debit: round2(l.debit ?? 0), credit: round2(l.credit ?? 0) }))
  if (lines.length < 2) throw new Error("Jurnal perlu minimal dua baris berisi.")
  for (const l of lines) {
    if (l.debit && l.credit) throw new Error(`Akun ${l.account}: isi debit atau kredit, jangan keduanya.`)
    const a = await w.get<Account>(ACCOUNTS, l.account)
    if (!a?.active) throw new Error(`Akun ${l.account} tidak ada atau tidak aktif.`)
    if (a.link && !allowStock) throw new Error(`Akun ${l.account} terhubung ke inventory; nilainya berubah lewat Jurnal buku bank, Saldo awal dan HPP bulanan.`)
  }
  const total = round2(lines.reduce((s, l) => s + l.debit, 0))
  const credit = round2(lines.reduce((s, l) => s + l.credit, 0))
  if (total !== credit) throw new Error(`Jurnal tidak seimbang: debit ${total.toLocaleString("id-ID")} ≠ kredit ${credit.toLocaleString("id-ID")}.`)
  return { lines, total, accounts: [...new Set(lines.map((l) => l.account))] }
}

/** Jurnal umum: a new JV.YY.MM.NNNN journal. Returns its number. */
export function saveManualJournal(input: { date: string; description: string; lines: LineInput[] }) {
  return transaction(async (w) => {
    const checked = await checkLines(w, input.lines, false)
    const [y, m] = input.date.split("-")
    const counter = `JV-${y}-${m}`
    const last = (await w.get<{ last: number }>("counters", counter))?.last ?? 0
    await w.set("counters", counter, { last: last + 1 }, { silent: true })
    const number = `JV.${y.slice(2)}.${m}.${String(last + 1).padStart(4, "0")}`
    const journal: Omit<Journal, "id"> = { date: input.date, number, description: input.description.trim(), ...checked, source: { kind: "manual" } }
    await w.set(JOURNALS, w.newId(JOURNALS), journal)
    return number
  })
}

/** Saldo awal: replaces the opening journal (balances per account on `date`); `test` = the separate test one. */
export function saveOpening(date: string, input: LineInput[], test = false) {
  return transaction(async (w) => {
    const checked = await checkLines(w, input, true)
    const journal: Omit<Journal, "id"> = {
      date,
      number: test ? "SALDO AWAL UJI" : "SALDO AWAL",
      description: `Saldo awal${test ? " uji" : ""} per ${date}`,
      ...checked,
      source: { kind: "opening" },
    }
    await w.set(JOURNALS, test ? OPENING_TEST_ID : OPENING_ID, journal)
    return checked.lines.length
  })
}
