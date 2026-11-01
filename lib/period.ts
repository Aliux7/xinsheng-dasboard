import type { Writer } from "@/lib/db"

/**
 * Closed months (Tutup buku), stored at `periods/{YYYY-MM}` with the report
 * figures as they were when closed. Nothing dated in a closed month can be
 * added, changed or cancelled.
 */
export const PERIODS = "periods"

export type MonthRow = {
  material: string
  name: string
  department: string
  unit: string
  begin: number
  in: number
  used: number
  shrinkage: number
  adjustment: number
  end: number
}

export type Period = {
  id: string
  rows: MonthRow[]
  closedBy: { uid: string; email: string | null }
  closedAt: { toDate: () => Date } | null
}

export const monthOf = (date: string) => date.slice(0, 7)

/** Call inside every transaction that adds or changes something dated `date`. */
export async function ensureOpen(w: Writer, date: string) {
  if (await w.get(PERIODS, monthOf(date))) {
    throw new Error(`Bulan ${monthOf(date)} sudah ditutup (tutup buku). Transaksi di bulan ini tidak bisa ditambah atau diubah.`)
  }
}
