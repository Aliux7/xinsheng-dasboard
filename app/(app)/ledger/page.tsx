"use client"

import { Suspense, useState } from "react"
import { useSearchParams } from "next/navigation"
import { FileDownIcon } from "lucide-react"

import { AccountSelect } from "@/components/account-select"
import { DataTable, type Column } from "@/components/data-table"
import { JournalDialog } from "@/components/journal-view"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useCollection } from "@/hooks/use-collection"
import { ACCOUNTS, JOURNALS, type Account, type Journal } from "@/lib/collections"
import { downloadExcel } from "@/lib/export"
import { linesOf, round2, signOf, type LedgerLine } from "@/lib/journal"
import { formatDay, formatNumber } from "@/lib/utils"

type Row = { id: string; date: string; number: string; journal?: Journal; counterparty: string; description: string; debit: number | null; credit: number | null; balance: number; total?: boolean }

export default function LedgerPage() {
  // ?account= (from the balance sheet / P&L) needs a Suspense boundary with cacheComponents.
  return (
    <Suspense>
      <Ledger />
    </Suspense>
  )
}

function Ledger() {
  const accounts = useCollection<Account>(ACCOUNTS).data
  const [code, setCode] = useState(useSearchParams().get("account") ?? "")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [open, setOpen] = useState<Journal | null>(null)
  const journals = useCollection<Journal>(JOURNALS, { where: [["accounts", "array-contains", code]], skip: !code })

  const account = accounts.find((a) => a.code === code)
  // Balances run in the account's normal direction (debit − credit, or credit − debit).
  const sign = signOf(account)
  const all = linesOf(journals.data, code)
  const net = (l: LedgerLine) => sign * (l.line.debit - l.line.credit)
  const opening = round2(all.filter((l) => from && l.date < from).reduce((s, l) => s + net(l), 0))
  const inRange = all.filter((l) => (!from || l.date >= from) && (!to || l.date <= to))
  const lines = inRange.reduce<Row[]>((acc, l) => {
    const balance = round2((acc.at(-1)?.balance ?? opening) + net(l))
    return [
      ...acc,
      {
        id: l.key,
        date: l.date,
        number: l.journal.number,
        journal: l.journal,
        counterparty: l.journal.counterparty,
        description: l.line.description || l.journal.description,
        debit: l.line.debit || null,
        credit: l.line.credit || null,
        balance,
      },
    ]
  }, [])
  const totalD = round2(inRange.reduce((s, l) => s + l.line.debit, 0))
  const totalC = round2(inRange.reduce((s, l) => s + l.line.credit, 0))
  const closing = lines.at(-1)?.balance ?? opening
  const summary = (id: string, label: string, balance: number, debit: number | null = null, credit: number | null = null): Row => ({
    id,
    date: "",
    number: "",
    counterparty: "",
    description: label,
    debit,
    credit,
    balance,
    total: true,
  })
  const rows = [summary("opening", "Saldo awal", opening), ...lines, summary("totals", "Total", closing, totalD, totalC), summary("closing", "Saldo akhir", closing)]

  const columns: Column<Row>[] = [
    { header: "Tanggal", cell: (r) => (r.date ? formatDay(r.date) : "") },
    {
      header: "No. dokumen",
      cell: (r) =>
        r.journal && (
          <button type="button" className="font-medium underline-offset-4 hover:underline" onClick={() => setOpen(r.journal!)}>
            {r.number || "—"}
          </button>
        ),
    },
    { header: "Pihak terkait", cell: (r) => r.counterparty, className: "hidden md:table-cell" },
    { header: "Keterangan", cell: (r) => <span className="whitespace-normal">{r.description}</span> },
    { header: "Debit", cell: (r) => (r.debit ? formatNumber(r.debit) : ""), className: "text-right tabular-nums" },
    { header: "Kredit", cell: (r) => (r.credit ? formatNumber(r.credit) : ""), className: "text-right tabular-nums" },
    { header: "Saldo", cell: (r) => formatNumber(r.balance), className: "text-right font-medium tabular-nums" },
  ]

  const exportExcel = () =>
    downloadExcel(
      `Buku_besar_${code}${from ? `_${from}` : ""}${to ? `_${to}` : ""}.xlsx`,
      `Buku besar ${code}`,
      columns.map((c) => c.header),
      rows.map((r) => [r.date || null, r.number || null, r.counterparty || null, r.description, r.debit, r.credit, r.balance]),
      [12, 18, 22, 40, 16, 16, 18]
    )

  return (
    <>
      <div className="flex flex-wrap items-end gap-3">
        <Field className="w-full sm:w-80">
          <FieldLabel htmlFor="account">Akun</FieldLabel>
          <AccountSelect id="account" value={code} onChange={setCode} accounts={accounts} />
        </Field>
        <Field className="w-40">
          <FieldLabel htmlFor="from">Dari</FieldLabel>
          <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field className="w-40">
          <FieldLabel htmlFor="to">Sampai</FieldLabel>
          <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <Button variant="outline" className="ml-auto" onClick={exportExcel} disabled={!code || journals.loading}>
          <FileDownIcon />
          Ekspor Excel
        </Button>
      </div>
      {code ? (
        <DataTable columns={columns} {...journals} data={rows} rowClassName={(r) => (r.total ? "bg-muted/50 font-medium" : undefined)} />
      ) : (
        <p className="text-sm text-muted-foreground">Pilih akun untuk melihat buku besarnya.</p>
      )}
      <JournalDialog journal={open} accounts={accounts} onClose={() => setOpen(null)} />
    </>
  )
}
