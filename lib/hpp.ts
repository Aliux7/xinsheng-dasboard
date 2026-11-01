import type { Account, FgProduction, Journal, Roll, SalesInvoice } from "@/lib/collections"
import type { ValueRow } from "@/lib/inventory"
import { round2 } from "@/lib/journal"
import { netByAccount } from "@/lib/statements"
import { monthRange } from "@/lib/utils"

/** One month's cost statement, laid out like the Excel COGS sheet. */
export type Hpp = {
  raw: { begin: number; purchase: number; available: number; toWip: number; end: number }
  labour: number
  overhead: number
  wip: { begin: number; production: number; available: number; toFinished: number; end: number }
  finished: { begin: number; manufactured: number; available: number; cogs: number; end: number }
  clothKg: number
  costPerKg: number
}

const sumRows = (rows: ValueRow[], k: keyof ValueRow) => round2(rows.reduce((s, r) => s + (r[k] as number), 0))
/** Direct labour (LR06) or factory overhead (LR07) accounts' debit − credit in [from, to). */
const lineCost = (journals: Journal[], accounts: Account[], code: string, from: string, to: string) => {
  const net = netByAccount(journals, from, to)
  return round2(accounts.filter((a) => (a.reportLine ?? "").toUpperCase() === code).reduce((s, a) => s + (net.get(a.code) ?? 0), 0))
}

export function hppMonth(
  month: string,
  byMonth: Map<string, ValueRow[]>,
  data: { journals: Journal[]; accounts: Account[]; rolls: Roll[]; productions: FgProduction[]; sales: SalesInvoice[] }
): Hpp {
  const [start, end] = monthRange(month)
  const rows = byMonth.get(month) ?? []
  // Material that moved between warehouse materials (washing input → output) isn't a purchase.
  const internal = sumRows(rows, "usedValue") - sumRows(rows, "consumedValue")
  const toWip = sumRows(rows, "consumedValue")
  const raw = { begin: sumRows(rows, "beginValue"), purchase: round2(sumRows(rows, "inValue") - internal), available: 0, toWip, end: sumRows(rows, "endValue") }
  raw.available = round2(raw.begin + raw.purchase)

  const labour = lineCost(data.journals, data.accounts, "LR06", start, end)
  const overhead = lineCost(data.journals, data.accounts, "LR07", start, end)
  // Everything before this month: material to WIP, labour, overhead, minus what became finished goods.
  const priorToWip = [...byMonth].filter(([m]) => m < month).reduce((s, [, r]) => s + sumRows(r, "consumedValue"), 0)
  const priorConversion = lineCost(data.journals, data.accounts, "LR06", "0000", start) + lineCost(data.journals, data.accounts, "LR07", "0000", start)
  const fgValue = (from: string, to: string) => round2(data.productions.filter((p) => p.date >= from && p.date < to).reduce((s, p) => s + p.value, 0))
  const cogsOf = (from: string, to: string) => round2(data.sales.filter((i) => i.date >= from && i.date < to).reduce((s, i) => s + (i.cogs ?? 0), 0))

  const production = round2(toWip + labour + overhead)
  const wipBegin = round2(priorToWip + priorConversion - fgValue("0000", start))
  const toFinished = fgValue(start, end)
  const wip = { begin: wipBegin, production, available: round2(wipBegin + production), toFinished, end: round2(wipBegin + production - toFinished) }
  const fgBegin = round2(fgValue("0000", start) - cogsOf("0000", start))
  const cogs = cogsOf(start, end)
  const finished = { begin: fgBegin, manufactured: toFinished, available: round2(fgBegin + toFinished), cogs, end: round2(fgBegin + toFinished - cogs) }
  const clothKg = round2(data.rolls.filter((r) => r.date >= start && r.date < end).reduce((s, r) => s + r.kg, 0))
  return { raw, labour, overhead, wip, finished, clothKg, costPerKg: clothKg ? round2(production / clothKg) : 0 }
}
