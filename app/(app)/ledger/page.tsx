"use client"

import { Suspense, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { EyeIcon } from "lucide-react"

import { DataTable, type Column } from "@/components/data-table"
import { JournalView } from "@/components/journal-view"
import { MonthPicker } from "@/components/month-picker"
import { SimpleSelect } from "@/components/simple-select"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { useLedger } from "@/hooks/use-ledger"
import { round2 } from "@/lib/bank-book"
import { SOURCE_LABELS, type Journal } from "@/lib/journal"
import { netByAccount, nextMonth, signed } from "@/lib/ledger"
import { formatDay, formatNumber, today } from "@/lib/utils"

type Row = { id: string; date: string; journal?: Journal; description: string; debit: number; credit: number; balance: number; total?: string }

export default function LedgerPage() {
  // ?account= needs a Suspense boundary with cacheComponents.
  return (
    <Suspense>
      <Ledger />
    </Suspense>
  )
}

/** One account's lines between two months, with the opening and running balance. */
function Ledger() {
  const router = useRouter()
  const ledger = useLedger()
  const code = useSearchParams().get("account") ?? ""
  const [from, setFrom] = useState(() => today().slice(0, 7))
  const [to, setTo] = useState(() => today().slice(0, 7))
  const [viewing, setViewing] = useState<string | null>(null)
  const account = ledger.byCode.get(code)
  const start = `${from}-01`
  const end = `${nextMonth(to < from ? from : to)}-01`

  const show = (net: number) => signed(account, net)
  const opening = netByAccount(ledger.journals, "", start).get(code) ?? 0
  let balance = opening
  const lines: Row[] = ledger.journals
    .filter((j) => j.date >= start && j.date < end && j.accounts.includes(code))
    .sort((a, b) => a.date.localeCompare(b.date) || a.number.localeCompare(b.number, undefined, { numeric: true }))
    .flatMap((j) =>
      j.lines
        .filter((l) => l.account === code)
        .map((l, i) => {
          balance = round2(balance + l.debit - l.credit)
          return { id: `${j.id}-${i}`, date: j.date, journal: j, description: l.description || j.description, debit: l.debit, credit: l.credit, balance }
        })
    )
  const debit = round2(lines.reduce((s, l) => s + l.debit, 0))
  const credit = round2(lines.reduce((s, l) => s + l.credit, 0))
  const rows: Row[] = code
    ? [
        { id: "open", date: "", description: "", debit: 0, credit: 0, balance: opening, total: "Saldo awal" },
        ...lines,
        { id: "close", date: "", description: "", debit, credit, balance, total: "Saldo akhir" },
      ]
    : []

  const columns: Column<Row>[] = [
    { header: "Tanggal", cell: (r) => (r.total ? <span className="font-medium">{r.total}</span> : formatDay(r.date)) },
    {
      header: "Jurnal",
      cell: (r) =>
        r.journal && (
          <div className="flex flex-col items-start gap-1">
            <span className="font-medium whitespace-nowrap">{r.journal.number}</span>
            <Badge variant="outline">{SOURCE_LABELS[r.journal.source.kind]}</Badge>
          </div>
        ),
    },
    { header: "Keterangan", cell: (r) => <span className="whitespace-normal">{r.description}</span> },
    { header: "Debit", cell: (r) => (r.debit ? formatNumber(r.debit) : ""), className: "text-right tabular-nums" },
    { header: "Kredit", cell: (r) => (r.credit ? formatNumber(r.credit) : ""), className: "text-right tabular-nums" },
    { header: "Saldo", cell: (r) => formatNumber(show(r.balance)), className: "text-right font-medium tabular-nums" },
    {
      header: "",
      cell: (r) =>
        r.journal && (
          <Button size="icon-sm" variant="ghost" onClick={() => setViewing(r.journal!.id)} aria-label={`Lihat ${r.journal.number}`}>
            <EyeIcon />
          </Button>
        ),
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-full sm:w-80">
          <SimpleSelect
            id="account"
            value={code}
            onChange={(c) => router.replace(c ? `/ledger?account=${c}` : "/ledger")}
            options={ledger.accounts.map((a) => ({ value: a.code, label: `${a.code} · ${a.nameId}` }))}
            placeholder={ledger.loading ? "Memuat…" : "Pilih akun"}
          />
        </div>
        <span className="text-sm text-muted-foreground">dari</span>
        <MonthPicker month={from} onChange={setFrom} />
        <span className="text-sm text-muted-foreground">sampai</span>
        <MonthPicker month={to} onChange={setTo} />
      </div>
      {account && (
        <p className="text-sm text-muted-foreground">
          Saldo normal {account.normalBalance === "credit" ? "kredit" : "debit"}: saldo positif = {account.normalBalance === "credit" ? "kredit" : "debit"}.
        </p>
      )}
      <DataTable
        columns={columns}
        data={rows}
        loading={ledger.loading}
        error={ledger.error}
        empty="Pilih akun."
        rowClassName={(r) => (r.total ? "bg-brand-soft/60 font-medium text-brand" : undefined)}
      />
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="sm:max-w-3xl">{viewing && <JournalView journal={ledger.journals.find((j) => j.id === viewing)} label={ledger.label} />}</DialogContent>
      </Dialog>
    </div>
  )
}
