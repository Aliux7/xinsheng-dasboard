import type { Timestamp } from "firebase/firestore"

export { cn } from "cn"

const dateFormat = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" })

export const formatDate = (ts?: Timestamp | null) => (ts ? dateFormat.format(ts.toDate()) : "—")

const numberFormat = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 })
const rupiahFormat = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 })

export const formatNumber = (n?: number | null) => (n == null ? "—" : numberFormat.format(n))
export const formatRupiah = (n?: number | null) => (n == null ? "—" : rupiahFormat.format(n))

/** Spreadsheet/form text → number, or null when blank or not a number. Accepts "1,5" as 1.5. */
export function toNumber(text: string) {
  const n = Number(text.trim().replace(",", "."))
  return text.trim() === "" || Number.isNaN(n) ? null : n
}

const pad = (n: number) => String(n).padStart(2, "0")

/** Today as YYYY-MM-DD in local time. */
export const today = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** Current time as HH:MM. */
export const nowTime = (d = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}`

/** "2026-10" → ["2026-10-01", "2026-11-01"), for date-range queries. */
export function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number)
  return [`${month}-01`, m === 12 ? `${y + 1}-01-01` : `${y}-${pad(m + 1)}-01`] as const
}

const dayFormat = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" })

/** "2026-10-31" → "31 Okt 2026". */
export const formatDay = (date?: string) => (date ? dayFormat.format(new Date(`${date}T00:00`)) : "—")
