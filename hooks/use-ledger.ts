"use client"

import { useCollection } from "@/hooks/use-collection"
import { ACCOUNTS, type Account } from "@/lib/accounts"
import { JOURNALS, isLedgerJournal, type Journal } from "@/lib/journal"

/**
 * Every journal of the ledger (live) and the chart of accounts, for the reports. `total >= 0` skips the
 * removed version's journals, which have no `total`.
 */
export function useLedger() {
  const journals = useCollection<Journal>(JOURNALS, { where: [["total", ">=", 0]] })
  const accounts = useCollection<Account>(ACCOUNTS, { orderBy: "code" })
  const byCode = new Map(accounts.data.map((a) => [a.code, a]))
  return {
    journals: journals.data.filter(isLedgerJournal),
    accounts: accounts.data,
    byCode,
    /** "101201 · Bank BCA 1 PT" */
    label: (code: string) => `${code} · ${byCode.get(code)?.nameId ?? "?"}`,
    loading: journals.loading || accounts.loading,
    error: journals.error ?? accounts.error,
  }
}
