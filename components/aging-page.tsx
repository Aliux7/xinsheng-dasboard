"use client"

import { useState } from "react"
import { FileDownIcon } from "lucide-react"

import { DataTable, type Column } from "@/components/data-table"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useCollection } from "@/hooks/use-collection"
import { useToday } from "@/hooks/use-today"
import { BUCKETS, aging, type AgingDoc, type AgingRow, type Bucket } from "@/lib/aging"
import { JOURNALS, type Journal } from "@/lib/collections"
import { downloadExcel } from "@/lib/export"
import { round2 } from "@/lib/journal"
import { formatDay, formatNumber } from "@/lib/utils"

type Props = {
  docs: AgingDoc[]
  loading: boolean
  /** Control accounts the total must match, e.g. ["211101", "211102"]. */
  accounts: string[]
  /** +1 when the accounts are debit-normal (receivables), −1 for payables. */
  sign: 1 | -1
  partyLabel: string
  fileName: string
}

/** Aging table with an "as of" date, drill-down per party, ledger cross-check and export. */
export function AgingPage({ docs, loading, accounts, sign, partyLabel, fileName }: Props) {
  const today = useToday()
  const [picked, setAsOf] = useState("")
  const asOf = picked || today || ""
  const [open, setOpen] = useState<AgingRow | null>(null)
  // One live query per control account; their lines up to "as of" must equal the open total.
  const a = useCollection<Journal>(JOURNALS, { where: [["accounts", "array-contains", accounts[0]]] })
  const b = useCollection<Journal>(JOURNALS, { where: [["accounts", "array-contains", accounts[1] ?? accounts[0]]], skip: !accounts[1] })
  const journals = [...new Map([...a.data, ...b.data].map((j) => [j.id, j])).values()]
  const ledger = round2(
    sign *
      journals.reduce(
        (s, j) => s + j.lines.filter((l) => accounts.includes(l.account) && (l.date ?? j.date) <= asOf).reduce((t, l) => t + l.debit - l.credit, 0),
        0
      )
  )

  const rows = asOf ? aging(docs, asOf) : []
  const sum = (key: "open" | Bucket) => round2(rows.reduce((s, r) => s + r[key], 0))
  const total: AgingRow = {
    id: "total",
    party: "",
    partyName: "Total",
    invoices: [],
    open: sum("open"),
    current: sum("current"),
    d30: sum("d30"),
    d60: sum("d60"),
    d90: sum("d90"),
    over90: sum("over90"),
  }
  const difference = round2(total.open - ledger)
  const data = [...rows, total]

  const columns: Column<AgingRow>[] = [
    {
      header: partyLabel,
      cell: (r) =>
        r.id === "total" ? (
          r.partyName
        ) : (
          <button type="button" className="font-medium underline-offset-4 hover:underline" onClick={() => setOpen(r)}>
            {r.partyName}
          </button>
        ),
    },
    { header: "Total terbuka", cell: (r) => formatNumber(r.open), className: "text-right font-medium tabular-nums" },
    ...BUCKETS.map(([key, header]) => ({ header, cell: (r: AgingRow) => (r[key] ? formatNumber(r[key]) : ""), className: "text-right tabular-nums" })),
  ]

  const exportExcel = () =>
    downloadExcel(
      `${fileName}_${asOf}.xlsx`,
      `Umur per ${asOf}`,
      columns.map((c) => c.header),
      data.map((r) => [r.partyName, r.open, ...BUCKETS.map(([k]) => r[k] || null)]),
      [34, 16, 16, 16, 16, 16, 16]
    )

  return (
    <>
      <div className="flex flex-wrap items-end gap-3">
        <Field className="w-44">
          <FieldLabel htmlFor="asOf">Per tanggal</FieldLabel>
          <Input id="asOf" type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
        </Field>
        {!loading && !a.loading && (
          <p className={`text-sm font-medium ${difference ? "text-destructive" : "text-green-600"}`}>
            Buku besar {accounts.join(" + ")}: {formatNumber(ledger)}
            {difference ? ` — selisih ${formatNumber(difference)}` : " — cocok"}
          </p>
        )}
        <Button variant="outline" className="ml-auto" onClick={exportExcel} disabled={loading}>
          <FileDownIcon />
          Ekspor Excel
        </Button>
      </div>
      <DataTable
        columns={columns}
        data={data}
        loading={loading}
        error={null}
        rowClassName={(r) => (r.id === "total" ? "bg-muted/50 font-semibold" : undefined)}
      />
      <Dialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{open?.partyName}</DialogTitle>
          </DialogHeader>
          {open && (
            <DataTable
              columns={[
                { header: "No.", cell: (i) => i.number },
                { header: "Tanggal", cell: (i) => formatDay(i.date) },
                { header: "Jatuh tempo", cell: (i) => formatDay(i.dueDate) },
                { header: "Lewat (hari)", cell: (i) => (i.daysPastDue > 0 ? i.daysPastDue : "—"), className: "text-right tabular-nums" },
                { header: "Terbuka", cell: (i) => formatNumber(i.open), className: "text-right tabular-nums" },
              ]}
              data={open.invoices}
              loading={false}
              error={null}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
