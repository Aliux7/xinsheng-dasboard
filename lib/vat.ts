import { VAT_PERIODS, type VatPeriod } from "@/lib/collections"
import type { Writer } from "@/lib/db"
import { monthOf } from "@/lib/period"

/** Purchase, import and sales invoices dated in a reported VAT month can't be added. */
export async function ensureVatOpen(w: Writer, date: string) {
  const period = await w.get<VatPeriod>(VAT_PERIODS, monthOf(date))
  if (period?.reported) throw new Error(`PPN bulan ${monthOf(date)} sudah dilaporkan; faktur di bulan ini tidak bisa ditambah.`)
}
