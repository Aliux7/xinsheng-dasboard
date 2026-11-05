"use client"

import { useState } from "react"
import Link from "next/link"

import { DataTable, type Column } from "@/components/data-table"
import { MonthPicker } from "@/components/month-picker"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldLabel } from "@/components/ui/field"
import { useLedger } from "@/hooks/use-ledger"
import type { Account } from "@/lib/accounts"
import { round2 } from "@/lib/bank-book"
import { netByAccount, nextMonth } from "@/lib/ledger"
import { cn, formatNumber, today } from "@/lib/utils"

type Row = { id: string; account?: Account; label: string; opening: number; debit: number; credit: number; closing: number; total?: boolean }

const money = (n: number) => (n ? formatNumber(n) : "")

/** Every account's opening balance, the month's debits and credits, and the closing balance; debits must equal credits. */
export default function TrialBalancePage() {
  const ledger = useLedger()
  const [month, setMonth] = useState(() => today().slice(0, 7))
  const [all, setAll] = useState(false)
  const start = `${month}-01`
  const end = `${nextMonth(month)}-01`

  const before = netByAccount(ledger.journals, "", start)
  const moves = new Map<string, { debit: number; credit: number }>()
  for (const j of ledger.journals) {
    if (j.date < start || j.date >= end) continue
    for (const l of j.lines) {
      const m = moves.get(l.account) ?? { debit: 0, credit: 0 }
      moves.set(l.account, { debit: round2(m.debit + l.debit), credit: round2(m.credit + l.credit) })
    }
  }
  const rows: Row[] = ledger.accounts
    .map((a) => {
      const opening = before.get(a.code) ?? 0
      const m = moves.get(a.code) ?? { debit: 0, credit: 0 }
      return { id: a.code, account: a, label: `${a.code} · ${a.nameId}`, opening, ...m, closing: round2(opening + m.debit - m.credit) }
    })
    .filter((r) => all || r.opening || r.debit || r.credit)
  // Codes on journal lines missing from Daftar akun still count.
  for (const code of new Set([...before.keys(), ...moves.keys()]))
    if (!ledger.byCode.has(code)) {
      const opening = before.get(code) ?? 0
      const m = moves.get(code) ?? { debit: 0, credit: 0 }
      rows.push({ id: code, label: `${code} · tidak ada di Daftar akun`, opening, ...m, closing: round2(opening + m.debit - m.credit) })
    }
  const sum = (f: (r: Row) => number) => round2(rows.reduce((s, r) => s + f(r), 0))
  const totals = {
    openDebit: sum((r) => Math.max(r.opening, 0)),
    openCredit: sum((r) => Math.max(-r.opening, 0)),
    debit: sum((r) => r.debit),
    credit: sum((r) => r.credit),
    closeDebit: sum((r) => Math.max(r.closing, 0)),
    closeCredit: sum((r) => Math.max(-r.closing, 0)),
  }
  const balanced = totals.closeDebit === totals.closeCredit && totals.debit === totals.credit

  const columns: Column<Row>[] = [
    {
      header: "Akun",
      cell: (r) => (r.total ? <span className="font-medium">{r.label}</span> : <Link className="hover:underline" href={`/ledger?account=${r.id}`}>{r.label}</Link>),
    },
    { header: "Awal debit", cell: (r) => money(r.total ? totals.openDebit : Math.max(r.opening, 0)), className: "text-right tabular-nums" },
    { header: "Awal kredit", cell: (r) => money(r.total ? totals.openCredit : Math.max(-r.opening, 0)), className: "text-right tabular-nums" },
    { header: "Mutasi debit", cell: (r) => money(r.debit), className: "text-right tabular-nums" },
    { header: "Mutasi kredit", cell: (r) => money(r.credit), className: "text-right tabular-nums" },
    { header: "Akhir debit", cell: (r) => money(r.total ? totals.closeDebit : Math.max(r.closing, 0)), className: "text-right font-medium tabular-nums" },
    { header: "Akhir kredit", cell: (r) => money(r.total ? totals.closeCredit : Math.max(-r.closing, 0)), className: "text-right font-medium tabular-nums" },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <MonthPicker month={month} onChange={setMonth} />
        <Field orientation="horizontal" className="w-auto">
          <Checkbox id="all" checked={all} onCheckedChange={setAll} />
          <FieldLabel htmlFor="all">Tampilkan akun tanpa saldo</FieldLabel>
        </Field>
        {!ledger.loading && (
          <span className={cn("text-sm font-medium", balanced ? "text-success" : "text-destructive")}>
            {balanced ? "Seimbang: debit = kredit" : "Tidak seimbang: periksa jurnal"}
          </span>
        )}
      </div>
      <DataTable
        columns={columns}
        data={[...rows, { id: "total", label: "Total", opening: 0, debit: totals.debit, credit: totals.credit, closing: 0, total: true }]}
        loading={ledger.loading}
        error={ledger.error}
        empty="Belum ada jurnal."
        rowClassName={(r) => (r.total ? "bg-brand-soft/60 font-medium text-brand" : undefined)}
      />
    </div>
  )
}
