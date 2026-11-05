"use client"

import { useState } from "react"

import { MonthPicker } from "@/components/month-picker"
import { StatementTable } from "@/components/statement-table"
import { useCollection } from "@/hooks/use-collection"
import { useLedger } from "@/hooks/use-ledger"
import { nextMonth } from "@/lib/ledger"
import { REPORT_LINES, type ReportLine } from "@/lib/report-lines"
import { profitLoss } from "@/lib/statements"
import { today } from "@/lib/utils"

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"]

/** Laba rugi of a month and of the year up to that month, by report line (LR..). */
export default function ProfitLossPage() {
  const ledger = useLedger()
  const lines = useCollection<ReportLine>(REPORT_LINES)
  const [month, setMonth] = useState(() => today().slice(0, 7))
  const [y, m] = month.split("-")
  const end = `${nextMonth(month)}-01`
  const pl = profitLoss(ledger.journals, ledger.accounts, lines.data, [
    { from: `${month}-01`, to: end },
    { from: `${y}-01-01`, to: end },
  ])
  const missing = pl.sections.flatMap((s) => s.rows).filter((r) => r.missing).length
  const cogsPosted = ledger.journals.some((j) => j.id === `HPP-${month}`)

  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <MonthPicker month={month} onChange={setMonth} />
      {!ledger.loading && !cogsPosted && (
        <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">
          HPP {month} belum diposting, jadi pemakaian bahan baku belum masuk ke laba rugi. Posting di HPP bulanan.
        </p>
      )}
      {missing > 0 && (
        <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">
          {missing} akun belum punya baris laporan dan tampil sendiri. Atur di Daftar akun → Baris laporan.
        </p>
      )}
      {ledger.loading ? (
        <p className="text-sm text-muted-foreground">Memuat…</p>
      ) : (
        <StatementTable
          sections={pl.sections}
          periods={[`${MONTHS[Number(m) - 1]} ${y}`, `Jan–${MONTHS[Number(m) - 1]} ${y}`]}
          label={ledger.label}
          after={{ production: [{ label: "Laba kotor", values: pl.gross }], expense: [{ label: "Laba usaha", values: pl.operating }] }}
          footer={[{ label: "Laba (rugi) bersih", values: pl.net }]}
        />
      )}
    </div>
  )
}
