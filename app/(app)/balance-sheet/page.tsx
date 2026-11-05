"use client"

import { useState } from "react"

import { MonthPicker } from "@/components/month-picker"
import { StatementTable } from "@/components/statement-table"
import { useCollection } from "@/hooks/use-collection"
import { useLedger } from "@/hooks/use-ledger"
import { lastDay, nextMonth } from "@/lib/ledger"
import { REPORT_LINES, type ReportLine } from "@/lib/report-lines"
import { balanceSheet } from "@/lib/statements"
import { cn, formatDay, formatNumber, today } from "@/lib/utils"

/** Neraca at the end of a month, by report line (NR..), with current-year earnings worked out from the ledger. */
export default function BalanceSheetPage() {
  const ledger = useLedger()
  const lines = useCollection<ReportLine>(REPORT_LINES)
  const [month, setMonth] = useState(() => today().slice(0, 7))
  const bs = balanceSheet(ledger.journals, ledger.accounts, lines.data, `${nextMonth(month)}-01`)
  const missing = bs.sections.flatMap((s) => s.rows).filter((r) => r.missing).length

  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <MonthPicker month={month} onChange={setMonth} />
        <span className="text-sm text-muted-foreground">Per {formatDay(lastDay(month))}</span>
        {!ledger.loading && (
          <span className={cn("text-sm font-medium", bs.difference ? "text-destructive" : "text-success")}>
            {bs.difference ? `Tidak seimbang: selisih ${formatNumber(bs.difference)}` : "Seimbang: aset = liabilitas + ekuitas"}
          </span>
        )}
      </div>
      {missing > 0 && (
        <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">
          {missing} akun belum punya baris laporan dan tampil sendiri. Atur di Daftar akun → Baris laporan.
        </p>
      )}
      {ledger.loading ? (
        <p className="text-sm text-muted-foreground">Memuat…</p>
      ) : (
        <StatementTable
          sections={bs.sections}
          periods={[formatDay(lastDay(month))]}
          label={ledger.label}
          after={{ fixed: [{ label: "Total aset", values: [bs.assets] }], equity: [{ label: "Total liabilitas + ekuitas", values: [bs.liabilitiesEquity] }] }}
        />
      )}
    </div>
  )
}
