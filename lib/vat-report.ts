import { serverTimestamp } from "firebase/firestore"

import { PURCHASE_ACCOUNTS, SALES_ACCOUNTS, VAT_PERIODS, type Journal } from "@/lib/collections"
import { transaction } from "@/lib/db"
import { auth } from "@/lib/firebase"
import { round2 } from "@/lib/journal"

export type VatMonth = {
  month: string
  carriedIn: number
  vatInLocal: number
  vatInImport: number
  vatOut: number
  /** VAT out − VAT in − carried forward. Positive = underpaid (pay); negative = overpaid (carry forward). */
  result: number
  carriedOut: number
  sales: number
  /** Entries behind each figure, for drill-down. */
  entries: { vatInLocal: Journal[]; vatInImport: Journal[]; vatOut: Journal[]; sales: Journal[] }
}

const sumOf = (journals: Journal[], account: string, side: "debit" | "credit") =>
  round2(journals.reduce((s, j) => s + j.lines.filter((l) => l.account === account).reduce((t, l) => t + (side === "debit" ? l.debit - l.credit : l.credit - l.debit), 0), 0))
const touching = (journals: Journal[], account: string) => journals.filter((j) => j.accounts.includes(account))

/** Twelve months of `year`; overpaid VAT carries forward from every earlier month (from the first entry). */
export function vatYear(journals: Journal[], year: number): VatMonth[] {
  const months = [...new Set(journals.map((j) => j.date.slice(0, 7)))].filter((m) => m < `${year}-01`).sort()
  for (let m = 1; m <= 12; m++) months.push(`${year}-${String(m).padStart(2, "0")}`)
  let carry = 0
  const out: VatMonth[] = []
  for (const month of months) {
    const these = journals.filter((j) => j.date.startsWith(month))
    const vatIn = touching(these, PURCHASE_ACCOUNTS.vatIn)
    const imports = vatIn.filter((j) => j.document?.type === "importPurchase")
    const local = vatIn.filter((j) => j.document?.type !== "importPurchase")
    const vatOut = touching(these, SALES_ACCOUNTS.vatOut)
    const row: VatMonth = {
      month,
      carriedIn: carry,
      vatInLocal: sumOf(local, PURCHASE_ACCOUNTS.vatIn, "debit"),
      vatInImport: sumOf(imports, PURCHASE_ACCOUNTS.vatIn, "debit"),
      vatOut: sumOf(vatOut, SALES_ACCOUNTS.vatOut, "credit"),
      result: 0,
      carriedOut: 0,
      sales: sumOf(touching(these, SALES_ACCOUNTS.sales), SALES_ACCOUNTS.sales, "credit"),
      entries: { vatInLocal: local, vatInImport: imports, vatOut, sales: touching(these, SALES_ACCOUNTS.sales) },
    }
    row.result = round2(row.vatOut - row.vatInLocal - row.vatInImport - carry)
    row.carriedOut = row.result < 0 ? -row.result : 0
    carry = row.carriedOut
    if (month.startsWith(String(year))) out.push(row)
  }
  return out
}

/** Marks a VAT month reported (filed); VAT-relevant documents dated in it are then locked. */
export function markVatReported(month: string, reported: boolean) {
  return transaction((w) =>
    w.set(VAT_PERIODS, month, { reported, reportedBy: { uid: auth.currentUser!.uid, email: auth.currentUser!.email }, reportedAt: serverTimestamp() })
  )
}
