import type { Account, AccountType } from "@/lib/accounts"
import type { Journal } from "@/lib/journal"
import { round2 } from "@/lib/bank-book"

/**
 * Reading the ledger: every report (Buku besar, Neraca saldo, Neraca, Laba rugi, HPP) sums journal lines
 * per account with these helpers. Dates are YYYY-MM-DD strings; ranges are [from, to).
 */

/** Profit & loss types; the rest (asset, liability, equity) are balance-sheet accounts. */
export const PNL_TYPES: AccountType[] = ["revenue", "production", "expense", "otherIncome", "otherExpense"]

/** By type, or by the first digit (4–9) when the account has none yet. */
export const isPnl = (a: Pick<Account, "code" | "type">) => (a.type ? PNL_TYPES.includes(a.type) : Number(a.code[0]) >= 4)

/** "2026-11" → "2026-12" */
export const nextMonth = (month: string) => {
  const [y, m] = month.split("-").map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`
}

/** Last day of a month, e.g. "2026-11" → "2026-11-30". */
export const lastDay = (month: string) => {
  const [y, m] = month.split("-").map(Number)
  return `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`
}

/** Net debit − credit per account of the journals dated in [from, to); `skip` leaves one journal out. */
export function netByAccount(journals: Journal[], from = "", to = "9999", skip?: string) {
  const net = new Map<string, number>()
  for (const j of journals) {
    if (j.date < from || j.date >= to || j.id === skip) continue
    for (const l of j.lines) net.set(l.account, round2((net.get(l.account) ?? 0) + l.debit - l.credit))
  }
  return net
}

/** A balance shown the way the account normally runs: debit-positive for debit accounts, else credit-positive. */
export const signed = (a: Pick<Account, "normalBalance" | "type"> | undefined, net: number) =>
  round2((a?.normalBalance ?? (a?.type && ["liability", "equity", "revenue", "otherIncome"].includes(a.type) ? "credit" : "debit")) === "credit" ? -net : net)
