"use client"

import { useState } from "react"
import { FileDownIcon } from "lucide-react"

import { DataTable, type Column } from "@/components/data-table"
import { MonthPicker, useMonth } from "@/components/month-picker"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Switch } from "@/components/ui/switch"
import { useCollection } from "@/hooks/use-collection"
import { ACCOUNTS, JOURNALS, type Account, type Journal } from "@/lib/collections"
import { downloadExcel } from "@/lib/export"
import { round2, trialBalance, type TrialRow } from "@/lib/journal"
import { formatNumber, monthRange } from "@/lib/utils"

const AMOUNTS = [
  ["openD", "Awal debit"],
  ["openC", "Awal kredit"],
  ["moveD", "Mutasi debit"],
  ["moveC", "Mutasi kredit"],
  ["endD", "Akhir debit"],
  ["endC", "Akhir kredit"],
] as const

type Row = TrialRow & { id: string; total?: boolean }

export default function TrialBalancePage() {
  const accounts = useCollection<Account>(ACCOUNTS).data
  const { month, setMonth, skip } = useMonth()
  const [fullYear, setFullYear] = useState(false)
  const [showZero, setShowZero] = useState(false)

  const year = month.slice(0, 4)
  const [from, to] = !month ? ["", ""] : fullYear ? [`${year}-01-01`, `${Number(year) + 1}-01-01`] : monthRange(month)
  // Everything up to the end of the period: earlier entries make up the opening balance.
  const journals = useCollection<Journal>(JOURNALS, { where: [["date", "<", to]], skip })

  const all = month ? trialBalance(journals.data, accounts, from, to) : []
  const rows = showZero ? all : all.filter((r) => AMOUNTS.some(([key]) => r[key]))
  const totals = Object.fromEntries(AMOUNTS.map(([key]) => [key, round2(all.reduce((s, r) => s + r[key], 0))])) as Record<(typeof AMOUNTS)[number][0], number>
  const difference = round2(totals.endD - totals.endC)
  const data: Row[] = [...rows.map((r) => ({ ...r, id: r.account })), { account: "", name: "Total", ...totals, id: "total", total: true }]

  const columns: Column<Row>[] = [
    { header: "No. akun", cell: (r) => r.account },
    { header: "Nama akun", cell: (r) => <span className="whitespace-normal">{r.name}</span> },
    ...AMOUNTS.map(([key, header]) => ({ header, cell: (r: Row) => (r[key] ? formatNumber(r[key]) : ""), className: "text-right tabular-nums" })),
  ]

  const period = fullYear ? year : month
  const exportExcel = () =>
    downloadExcel(
      `Neraca_saldo_${period}.xlsx`,
      `Neraca saldo ${period}`,
      columns.map((c) => c.header),
      data.map((r) => [r.account || null, r.name, ...AMOUNTS.map(([key]) => r[key])]),
      [10, 36, 16, 16, 16, 16, 16, 16]
    )

  return (
    <>
      <div className="flex flex-wrap items-center gap-4">
        <MonthPicker month={month} setMonth={setMonth} />
        <Field orientation="horizontal" className="w-auto">
          <Switch id="fullYear" checked={fullYear} onCheckedChange={setFullYear} />
          <FieldLabel htmlFor="fullYear">Setahun penuh {year}</FieldLabel>
        </Field>
        <Field orientation="horizontal" className="w-auto">
          <Switch id="showZero" checked={showZero} onCheckedChange={setShowZero} />
          <FieldLabel htmlFor="showZero">Tampilkan akun nol</FieldLabel>
        </Field>
        <Button variant="outline" className="ml-auto" onClick={exportExcel} disabled={journals.loading || !month}>
          <FileDownIcon />
          Ekspor Excel
        </Button>
      </div>
      {!journals.loading && (
        <p className={`text-sm font-medium ${difference ? "text-destructive" : "text-green-600"}`}>
          {difference ? `Tidak seimbang: selisih debit − kredit ${formatNumber(difference)}` : "Seimbang: total debit = total kredit."}
        </p>
      )}
      <DataTable columns={columns} {...journals} data={data} rowClassName={(r) => (r.total ? "bg-muted/50 font-semibold" : undefined)} />
    </>
  )
}
