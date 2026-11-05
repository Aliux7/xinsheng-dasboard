import type { Timestamp } from "firebase/firestore"

export { cn } from "cn"

const dateFormat = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" })

export const formatDate = (ts?: Timestamp | null) => (ts ? dateFormat.format(ts.toDate()) : "—")

const numberFormat = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 })
export const formatNumber = (n?: number | null) => (n == null ? "—" : numberFormat.format(n))

const dayFormat = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" })
/** "2026-10-31" → "31 Okt 2026". */
export const formatDay = (date?: string) => (date ? dayFormat.format(new Date(`${date}T00:00`)) : "—")

const pad = (n: number) => String(n).padStart(2, "0")
/** Today as YYYY-MM-DD in local time. */
export const today = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
