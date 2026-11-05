import type { Timestamp } from "firebase/firestore"

export { cn } from "cn"

const dateFormat = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" })

export const formatDate = (ts?: Timestamp | null) => (ts ? dateFormat.format(ts.toDate()) : "—")
