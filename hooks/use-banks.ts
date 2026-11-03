"use client"

import { useCollection } from "@/hooks/use-collection"
import { BANKS, DEFAULT_BANKS, type Bank } from "@/lib/collections"

/**
 * Own bank accounts (Pengaturan). `all` includes inactive ones (for labels of old entries); `banks` is
 * what forms offer. A DEFAULT_BANKS entry counts until a bank with its code is saved (`unsaved` lists
 * those), the same fallback as `bankOf` in lib/journal.ts.
 */
export function useBanks() {
  const result = useCollection<Bank>(BANKS, { orderBy: "code" })
  const unsaved = result.loading ? [] : DEFAULT_BANKS.filter((d) => !result.data.some((b) => b.code === d.code)).map((d) => ({ ...d, id: d.code }))
  const all = [...unsaved, ...result.data]
  return { all, banks: all.filter((b) => b.active), unsaved, loading: result.loading }
}
