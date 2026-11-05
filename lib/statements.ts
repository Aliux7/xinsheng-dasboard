import { guessType, type Account, type AccountType } from "@/lib/accounts"
import { round2 } from "@/lib/bank-book"
import type { Journal } from "@/lib/journal"
import { isPnl, netByAccount } from "@/lib/ledger"
import type { ReportLine } from "@/lib/report-lines"

/**
 * Neraca and Laba rugi from the ledger. Accounts roll up into their report line (Baris laporan, NR../LR..);
 * an account without one is shown on its own, marked, so nothing is left out. Neraca sections come from
 * the NR number (01–19 current assets, 20–49 fixed assets, 50–55 short-term liabilities, 56–59 long-term,
 * 60+ equity); Laba rugi sections from the account type.
 */

export type StatementRow = {
  key: string
  label: string
  /** Report line code, when the row is one. */
  line?: string
  accounts: string[]
  /** One value per period. */
  values: number[]
  /** An account without a report line. */
  missing?: boolean
  /** Worked out (retained / current earnings), not an account balance. */
  computed?: boolean
}

export type StatementSection = { key: string; label: string; rows: StatementRow[]; totals: number[] }

const BS_SECTIONS = [
  { key: "current", label: "Aset lancar", side: "asset" },
  { key: "fixed", label: "Aset tetap", side: "asset" },
  { key: "short", label: "Liabilitas jangka pendek", side: "le" },
  { key: "long", label: "Liabilitas jangka panjang", side: "le" },
  { key: "equity", label: "Ekuitas", side: "le" },
] as const

const bsSection = (line: string | undefined, type: AccountType | null) => {
  const n = line?.startsWith("NR") ? Number(line.slice(2)) : NaN
  if (!Number.isNaN(n)) return n < 20 ? "current" : n < 50 ? "fixed" : n < 56 ? "short" : n < 60 ? "long" : "equity"
  return type === "liability" ? "short" : type === "equity" ? "equity" : "current"
}

const typeOf = (a: Account) => a.type ?? guessType(a.code)

/** Rows of accounts grouped by report line, one value per period (`nets`), shown with `sign`. */
function rowsOf(accounts: Account[], nets: Map<string, number>[], lineName: Map<string, string>, sign: number): StatementRow[] {
  const groups = new Map<string, StatementRow>()
  for (const a of accounts) {
    const values = nets.map((n) => round2(sign * (n.get(a.code) ?? 0)))
    if (values.every((v) => !v)) continue
    const line = a.reportLine?.trim().toUpperCase()
    const key = line || `acc:${a.code}`
    const row = groups.get(key) ?? {
      key,
      label: line ? (lineName.get(line) ?? line) : `${a.code} ${a.nameId}`,
      line: line || undefined,
      accounts: [],
      values: nets.map(() => 0),
      missing: !line,
    }
    row.accounts.push(a.code)
    row.values = row.values.map((v, i) => round2(v + values[i]))
    groups.set(key, row)
  }
  return [...groups.values()].sort((x, y) => (x.line ?? `~${x.accounts[0]}`).localeCompare(y.line ?? `~${y.accounts[0]}`, undefined, { numeric: true }))
}

const total = (rows: StatementRow[], periods: number) => Array.from({ length: periods }, (_, i) => round2(rows.reduce((s, r) => s + r.values[i], 0)))

/** Neraca at the end of the day before `to` (YYYY-MM-DD, exclusive). */
export function balanceSheet(journals: Journal[], accounts: Account[], lines: ReportLine[], to: string) {
  const lineName = new Map(lines.map((l) => [l.code, l.name]))
  const net = netByAccount(journals, "", to)
  const yearStart = `${to.slice(0, 4)}-01-01` < to ? `${to.slice(0, 4)}-01-01` : `${Number(to.slice(0, 4)) - 1}-01-01`
  const before = netByAccount(journals, "", yearStart)
  const pnl = accounts.filter(isPnl)
  const sumPnl = (n: Map<string, number>) => round2(-pnl.reduce((s, a) => s + (n.get(a.code) ?? 0), 0))
  const prior = sumPnl(before)
  const current = round2(sumPnl(net) - prior)

  const sections: StatementSection[] = BS_SECTIONS.map((s) => {
    const own = accounts.filter((a) => !isPnl(a) && bsSection(a.reportLine, typeOf(a)) === s.key)
    const rows = rowsOf(own, [net], lineName, s.side === "asset" ? 1 : -1)
    if (s.key === "equity") {
      if (prior) rows.push({ key: "prior", label: "Laba ditahan tahun-tahun lalu (dihitung)", accounts: [], values: [prior], computed: true })
      rows.push({ key: "current-earnings", label: "Laba (rugi) tahun berjalan", accounts: [], values: [current], computed: true })
    }
    return { key: s.key, label: s.label, rows, totals: total(rows, 1) }
  })
  const assets = round2(sections.filter((s) => s.key === "current" || s.key === "fixed").reduce((s, x) => s + x.totals[0], 0))
  const liabilitiesEquity = round2(sections.filter((s) => s.key !== "current" && s.key !== "fixed").reduce((s, x) => s + x.totals[0], 0))
  return { sections, assets, liabilitiesEquity, difference: round2(assets - liabilitiesEquity), current }
}

const PNL_SECTIONS: { key: string; label: string; types: (AccountType | null)[]; sign: 1 | -1 }[] = [
  { key: "revenue", label: "Pendapatan", types: ["revenue"], sign: -1 },
  { key: "production", label: "Harga pokok penjualan & biaya produksi", types: ["production"], sign: 1 },
  { key: "expense", label: "Beban usaha", types: ["expense"], sign: 1 },
  { key: "otherIncome", label: "Pendapatan lain-lain", types: ["otherIncome"], sign: -1 },
  { key: "otherExpense", label: "Beban lain-lain", types: ["otherExpense", null], sign: 1 },
]

/** Laba rugi for several periods at once, each [from, to). */
export function profitLoss(journals: Journal[], accounts: Account[], lines: ReportLine[], periods: { from: string; to: string }[]) {
  const lineName = new Map(lines.map((l) => [l.code, l.name]))
  const nets = periods.map((p) => netByAccount(journals, p.from, p.to))
  const pnl = accounts.filter(isPnl)
  const sections: StatementSection[] = PNL_SECTIONS.map((s) => {
    const rows = rowsOf(pnl.filter((a) => s.types.includes(typeOf(a))), nets, lineName, s.sign)
    return { key: s.key, label: s.label, rows, totals: total(rows, periods.length) }
  })
  const t = (key: string) => sections.find((s) => s.key === key)!.totals
  const each = (f: (i: number) => number) => periods.map((_, i) => round2(f(i)))
  const gross = each((i) => t("revenue")[i] - t("production")[i])
  const operating = each((i) => gross[i] - t("expense")[i])
  const net = each((i) => operating[i] + t("otherIncome")[i] - t("otherExpense")[i])
  return { sections, gross, operating, net }
}
