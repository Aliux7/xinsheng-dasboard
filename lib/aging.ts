import { round2 } from "@/lib/journal"

/** Anything with an amount owed and dated payments: purchase or sales invoices. */
export type AgingDoc = {
  id: string
  number: string
  party: string
  partyName: string
  date: string
  dueDate: string
  /** Amount owed when issued. */
  total: number
  payments: { date: string; amount: number }[]
}

export const BUCKETS = [
  ["current", "Belum jatuh tempo"],
  ["d30", "1–30 hari"],
  ["d60", "31–60 hari"],
  ["d90", "61–90 hari"],
  ["over90", "> 90 hari"],
] as const
export type Bucket = (typeof BUCKETS)[number][0]

const DAY = 86_400_000
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY)

export function bucketOf(daysPastDue: number): Bucket {
  if (daysPastDue <= 0) return "current"
  if (daysPastDue <= 30) return "d30"
  if (daysPastDue <= 60) return "d60"
  if (daysPastDue <= 90) return "d90"
  return "over90"
}

export type AgingInvoice = AgingDoc & { open: number; daysPastDue: number; bucket: Bucket }
export type AgingRow = { id: string; party: string; partyName: string; open: number; invoices: AgingInvoice[] } & Record<Bucket, number>

/** What's still open on each document as of `asOf` (issued by then, minus payments by then), grouped per party. */
export function aging(docs: AgingDoc[], asOf: string): AgingRow[] {
  const rows = new Map<string, AgingRow>()
  for (const doc of docs) {
    if (doc.date > asOf) continue
    const paid = doc.payments.filter((p) => p.date <= asOf).reduce((s, p) => s + p.amount, 0)
    const open = round2(doc.total - paid)
    if (Math.abs(open) < 0.005) continue
    const daysPastDue = daysBetween(doc.dueDate || doc.date, asOf)
    const invoice: AgingInvoice = { ...doc, open, daysPastDue, bucket: bucketOf(daysPastDue) }
    const row =
      rows.get(doc.party) ??
      ({ id: doc.party, party: doc.party, partyName: doc.partyName, open: 0, invoices: [], current: 0, d30: 0, d60: 0, d90: 0, over90: 0 } as AgingRow)
    row.open = round2(row.open + open)
    row[invoice.bucket] = round2(row[invoice.bucket] + open)
    row.invoices.push(invoice)
    rows.set(doc.party, row)
  }
  return [...rows.values()].sort((a, b) => a.partyName.localeCompare(b.partyName))
}
