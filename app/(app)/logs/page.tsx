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

const columns: Column<Log>[] = [
  { header: "Waktu", cell: (l) => formatDate(l.at), className: "text-muted-foreground" },
  { header: "Oleh", cell: (l) => l.by.email },
  { header: "Aksi", cell: (l) => <Badge variant={l.action === "delete" ? "destructive" : "outline"}>{ACTION_LABELS[l.action]}</Badge> },
  { header: "Data", cell: (l) => <code className="text-xs">{l.collection}/{l.docId}</code> },
  { header: "Perubahan", cell: (l) => <Changes changes={l.changes} />, className: "hidden lg:table-cell" },
]

export default function LogsPage() {
  const logs = useCollection<Log>("logs", { orderBy: "at", desc: true, limit: 100 })
  return <DataTable columns={columns} {...logs} empty="Belum ada perubahan tercatat." />
}
