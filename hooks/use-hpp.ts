"use client"

import { useCollection } from "@/hooks/use-collection"
import { useInventory } from "@/hooks/use-inventory"
import { ACCOUNTS, FG_PRODUCTIONS, JOURNALS, ROLLS, SALES_INVOICES, type Account, type FgProduction, type Journal, type Roll, type SalesInvoice } from "@/lib/collections"
import { hppMonth } from "@/lib/hpp"
import { monthRange } from "@/lib/utils"

/** HPP (cost statement) for one month, or null while loading / unknown. */
export function useHpp(month: string) {
  const [, end] = month ? monthRange(month) : ["", ""]
  const inventory = useInventory(month)
  const journals = useCollection<Journal>(JOURNALS, { where: [["date", "<", end]], skip: !month })
  const accounts = useCollection<Account>(ACCOUNTS)
  const rolls = useCollection<Roll>(ROLLS)
  const productions = useCollection<FgProduction>(FG_PRODUCTIONS)
  const sales = useCollection<SalesInvoice>(SALES_INVOICES)
  const loading = inventory.loading || journals.loading || accounts.loading || rolls.loading || productions.loading || sales.loading
  const hpp = loading || !month ? null : hppMonth(month, inventory.byMonth, { journals: journals.data, accounts: accounts.data, rolls: rolls.data, productions: productions.data, sales: sales.data })
  return { hpp, loading }
}
