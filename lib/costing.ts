import type { Account } from "@/lib/accounts"
import { round2 } from "@/lib/bank-book"
import { transaction } from "@/lib/db"
import type { InventoryItem, InventoryMovement } from "@/lib/inventory"
import { JOURNALS, type Journal, type JournalLine } from "@/lib/journal"
import { lastDay, netByAccount, nextMonth } from "@/lib/ledger"

/**
 * Inventory value and HPP (cost of goods sold).
 *
 * Value: moving weighted average per item, movements in date order. An "in" adds its `value` (purchase,
 * opening stock) or, without one, qty × current average; an "out" takes its `value` (a cancelled purchase)
 * or qty × current average. Usage = outs typed in Stok bahan baku (not made by a journal).
 *
 * HPP bulanan (one journal per month, id `HPP-YYYY-MM`, dated the month's last day):
 *   usage of the month          Dr 105201 WIP           Cr each item's inventory account
 *   production costs (5xxxxx)   Dr 105201 WIP           Cr its allocation account (e.g. 502999) or itself
 *   cost of goods manufactured  Dr 105301 Barang jadi   Cr 105201 WIP    = WIP begin + usage + costs − WIP end
 *   HPP                         Dr 510101 HPP           Cr 105301        = FG begin + manufactured − FG end
 * WIP end and FG end (rupiah) are typed for the month; with no stock left both are 0.
 */
export const COGS_ACCOUNTS = { wip: "105201", fg: "105301", cogs: "510101" } as const

export type ValuedMovement = InventoryMovement & { cost: number; qtyAfter: number; valueAfter: number }

const byTime = (a: InventoryMovement, b: InventoryMovement) => a.date.localeCompare(b.date) || a.savedAt.localeCompare(b.savedAt)

/** Each item's movements in order, with the rupiah each one added (+) or took (−). */
export function valueMovements(movements: InventoryMovement[]) {
  const out = new Map<string, ValuedMovement[]>()
  for (const m of [...movements].sort(byTime)) {
    const list = out.get(m.item) ?? []
    const prev = list.at(-1)
    const qty = prev?.qtyAfter ?? 0
    const value = prev?.valueAfter ?? 0
    const avg = qty > 0 ? value / qty : 0
    const added = m.in ? (m.value ?? m.in * avg) : 0
    const qtyAfter = Math.round((qty + m.in - m.out) * 1000) / 1000
    // The last unit out takes whatever value is left, so rounding never strands rupiah.
    const taken = m.out ? (m.value ?? (qtyAfter <= 0 ? value + added : m.out * avg)) : 0
    const valueAfter = qtyAfter <= 0 ? 0 : round2(value + added - taken)
    list.push({ ...m, cost: round2(added - taken), qtyAfter, valueAfter })
    out.set(m.item, list)
  }
  return out
}

export type ItemMonth = {
  item: InventoryItem
  begin: { qty: number; value: number }
  in: { qty: number; value: number }
  /** Outs typed in Stok bahan baku: used in production. */
  usage: { qty: number; value: number }
  /** Outs made by journals (e.g. raw material sold or returned through the bank). */
  otherOut: { qty: number; value: number }
  end: { qty: number; value: number }
}

/** Per item: begin, in, usage, other outs and end of a month (YYYY-MM), in quantity and rupiah. */
export function monthValues(items: InventoryItem[], valued: Map<string, ValuedMovement[]>, month: string): ItemMonth[] {
  const from = `${month}-01`
  const to = `${nextMonth(month)}-01`
  return items.map((item) => {
    const list = valued.get(item.id) ?? []
    const before = list.filter((m) => m.date < from).at(-1)
    const within = list.filter((m) => m.date >= from && m.date < to)
    const sum = (ms: ValuedMovement[], qty: (m: ValuedMovement) => number) => ({
      qty: Math.round(ms.reduce((s, m) => s + qty(m), 0) * 1000) / 1000,
      value: round2(ms.reduce((s, m) => s + Math.abs(m.cost), 0)),
    })
    const last = within.at(-1) ?? before
    return {
      item,
      begin: { qty: before?.qtyAfter ?? 0, value: before?.valueAfter ?? 0 },
      in: sum(within.filter((m) => m.in > 0), (m) => m.in),
      usage: sum(within.filter((m) => m.out > 0 && !m.source), (m) => m.out),
      otherOut: sum(within.filter((m) => m.out > 0 && !!m.source), (m) => m.out),
      end: { qty: last?.qtyAfter ?? 0, value: last?.valueAfter ?? 0 },
    }
  })
}

export type Cogs = {
  month: string
  usage: { account: string; value: number }[]
  usageTotal: number
  costs: { account: string; amount: number; to: string }[]
  costsTotal: number
  wipBegin: number
  wipEnd: number
  fgBegin: number
  fgEnd: number
  manufactured: number
  cogs: number
  lines: JournalLine[]
  problems: string[]
}

/**
 * The month's HPP from the ledger (without that month's own HPP journal) and the stock usage.
 * Production costs = net debit of production accounts (type "Biaya produksi") except HPP (51xxxx) and
 * the allocation accounts (xxx999), which only HPP journals use.
 */
export function computeCogs(args: {
  month: string
  journals: Journal[]
  accounts: Account[]
  months: ItemMonth[]
  wipEnd: number
  fgEnd: number
}): Cogs {
  const { month, journals, accounts, months, wipEnd, fgEnd } = args
  const from = `${month}-01`
  const to = `${nextMonth(month)}-01`
  const own = `HPP-${month}`
  const byCode = new Map(accounts.map((a) => [a.code, a]))
  const problems: string[] = []
  for (const code of Object.values(COGS_ACCOUNTS)) if (!byCode.get(code)?.active) problems.push(`Akun ${code} tidak ada atau tidak aktif di Daftar akun.`)

  const usageBy = new Map<string, number>()
  for (const m of months) {
    if (!m.usage.value) continue
    if (!m.item.account) problems.push(`${m.item.code ?? ""} ${m.item.name} belum punya akun persediaan.`.trim())
    else usageBy.set(m.item.account, round2((usageBy.get(m.item.account) ?? 0) + m.usage.value))
  }
  const usage = [...usageBy].map(([account, value]) => ({ account, value }))
  const usageTotal = round2(usage.reduce((s, u) => s + u.value, 0))

  const net = netByAccount(journals, from, to, own)
  const costs = [...net]
    .filter(([code, amount]) => amount && byCode.get(code)?.type === "production" && !code.startsWith("51") && !code.endsWith("999"))
    .map(([account, amount]) => {
      const alloc = `${account.slice(0, 3)}999`
      return { account, amount, to: byCode.get(alloc)?.active ? alloc : account }
    })
    .sort((a, b) => a.account.localeCompare(b.account))
  const costsTotal = round2(costs.reduce((s, c) => s + c.amount, 0))

  const before = netByAccount(journals, "", from, own)
  const wipBegin = before.get(COGS_ACCOUNTS.wip) ?? 0
  const fgBegin = before.get(COGS_ACCOUNTS.fg) ?? 0
  const manufactured = round2(wipBegin + usageTotal + costsTotal - wipEnd)
  const cogs = round2(fgBegin + manufactured - fgEnd)
  if (manufactured < 0) problems.push("Barang dalam proses akhir lebih besar dari yang tersedia.")
  if (cogs < 0) problems.push("Barang jadi akhir lebih besar dari yang tersedia.")

  const line = (account: string, description: string, debit: number, credit: number): JournalLine => ({ account, description, debit: round2(debit), credit: round2(credit) })
  const allocated = new Map<string, number>()
  for (const c of costs) allocated.set(c.to, round2((allocated.get(c.to) ?? 0) + c.amount))
  const lines = [
    usageTotal ? line(COGS_ACCOUNTS.wip, "Pemakaian bahan baku", usageTotal, 0) : null,
    ...usage.map((u) => line(u.account, "Pemakaian bahan baku", 0, u.value)),
    costsTotal ? line(COGS_ACCOUNTS.wip, "Biaya produksi ke barang dalam proses", Math.max(costsTotal, 0), Math.max(-costsTotal, 0)) : null,
    ...[...allocated].map(([account, amount]) => (amount > 0 ? line(account, "Alokasi biaya produksi", 0, amount) : line(account, "Alokasi biaya produksi", -amount, 0))),
    manufactured ? line(COGS_ACCOUNTS.fg, "Barang selesai diproduksi", manufactured, 0) : null,
    manufactured ? line(COGS_ACCOUNTS.wip, "Barang selesai diproduksi", 0, manufactured) : null,
    cogs ? line(COGS_ACCOUNTS.cogs, "Harga pokok penjualan", cogs, 0) : null,
    cogs ? line(COGS_ACCOUNTS.fg, "Harga pokok penjualan", 0, cogs) : null,
  ].filter((l): l is JournalLine => !!l && (l.debit > 0 || l.credit > 0))
  return { month, usage, usageTotal, costs, costsTotal, wipBegin, wipEnd, fgBegin, fgEnd, manufactured, cogs, lines, problems }
}

/** Posts the month's HPP journal; fails if the month already has one. */
export function postCogs(c: Cogs) {
  if (c.problems.length) throw new Error(c.problems[0])
  if (!c.lines.length) throw new Error("Tidak ada pemakaian atau biaya produksi bulan ini.")
  const total = round2(c.lines.reduce((s, l) => s + l.debit, 0))
  if (total !== round2(c.lines.reduce((s, l) => s + l.credit, 0))) throw new Error("Jurnal HPP tidak seimbang.")
  const [y, m] = c.month.split("-")
  return transaction(async (w) => {
    const id = `HPP-${c.month}`
    if (await w.get(JOURNALS, id)) throw new Error(`HPP ${c.month} sudah diposting; batalkan dulu untuk menghitung ulang.`)
    const journal: Omit<Journal, "id"> = {
      date: lastDay(c.month),
      number: `HPP.${y.slice(2)}.${m}`,
      description: `HPP bulan ${c.month}`,
      lines: c.lines,
      accounts: [...new Set(c.lines.map((l) => l.account))],
      total,
      source: { kind: "cogs", month: c.month },
      cogs: { usage: c.usageTotal, costs: c.costsTotal, wipBegin: c.wipBegin, wipEnd: c.wipEnd, fgBegin: c.fgBegin, fgEnd: c.fgEnd, manufactured: c.manufactured, cogs: c.cogs },
    }
    await w.set(JOURNALS, id, journal)
    return journal.number
  })
}
