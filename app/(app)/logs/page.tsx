"use client"

import { DataTable, type Column } from "@/components/data-table"
import { Badge } from "@/components/ui/badge"
import { useCollection } from "@/hooks/use-collection"
import { ACTION_LABELS, type Change, type Log } from "@/lib/db"
import { formatDate } from "@/lib/utils"

const show = (v: unknown) =>
  v == null || v === "" ? "∅" : typeof v === "string" ? v : JSON.stringify(v)

function Changes({ changes }: { changes: Record<string, Change> }) {
  return (
    <ul className="text-xs whitespace-normal">
      {Object.entries(changes).map(([field, { from, to }]) => (
        <li key={field}>
          <span className="font-medium">{field}</span>:{" "}
          <span className="text-muted-foreground line-through">{show(from)}</span> → {show(to)}
        </li>
      ))}
    </ul>
  )
}

/** Indonesian names of the collections, for the Data column. */
const COLLECTION_LABELS: Record<string, string> = {
  users: "Pengguna",
  accounts: "Daftar akun",
  reportLines: "Baris laporan",
  banks: "Rekening bank",
  bankTransactions: "Buku bank",
  journals: "Jurnal",
  inventoryItems: "Bahan baku",
  inventoryMovements: "Pergerakan stok",
}

/** A readable one-liner of what the entry is about, from the fields it wrote. */
function summary(l: Log) {
  const to = (k: string) => l.changes[k]?.to ?? l.changes[k]?.from
  if (l.collection === "inventoryMovements") {
    const parts = [to("in") ? `masuk ${to("in")}` : "", to("out") ? `keluar ${to("out")}` : ""].filter(Boolean).join(", ")
    return `${[to("itemCode"), to("itemName")].filter(Boolean).join(" ")}: ${parts} ${to("unit") ?? ""} (${to("date")})`
  }
  if (l.collection === "inventoryItems" && l.changes.stock && l.action === "update")
    return `Stok ${show(l.changes.stock.from)} → ${show(l.changes.stock.to)}`
  const title = ["name", "nameId", "number", "code", "description"].map(to).find((v) => typeof v === "string" && v)
  return title ? String(title) : ""
}

const ACTION_BADGE = { create: "success", update: "brand", delete: "destructive" } as const

const columns: Column<Log>[] = [
  { header: "Waktu", cell: (l) => formatDate(l.at), className: "text-muted-foreground" },
  { header: "Oleh", cell: (l) => l.by.email },
  { header: "Aksi", cell: (l) => <Badge variant={ACTION_BADGE[l.action]}>{ACTION_LABELS[l.action]}</Badge> },
  {
    header: "Data",
    cell: (l) => (
      <div className="whitespace-normal">
        <div className="font-medium">{COLLECTION_LABELS[l.collection] ?? l.collection}</div>
        <div className="text-xs">{summary(l)}</div>
        <code className="text-[10px] text-muted-foreground">{l.docId}</code>
      </div>
    ),
  },
  { header: "Perubahan", cell: (l) => <Changes changes={l.changes} />, className: "hidden lg:table-cell" },
]

export default function LogsPage() {
  const logs = useCollection<Log>("logs", { orderBy: "at", desc: true, limit: 100 })
  return <DataTable columns={columns} {...logs} empty="Belum ada perubahan tercatat." />
}
