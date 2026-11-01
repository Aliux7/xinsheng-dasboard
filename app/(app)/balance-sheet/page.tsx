"use client"

import { StatementTable, type StatementRow } from "@/components/statement-table"
import { YearField, useYear } from "@/components/year-field"
import { useCollection } from "@/hooks/use-collection"
import { ACCOUNTS, JOURNALS, type Account, type Journal } from "@/lib/collections"
import { round2 } from "@/lib/journal"
import { BALANCE_LAYOUT, balanceSheet, netByAccount, sectionTotal } from "@/lib/statements"

export default function BalanceSheetPage() {
  const { year, setYear } = useYear()
  const accounts = useCollection<Account>(ACCOUNTS).data
  const journals = useCollection<Journal>(JOURNALS, { where: [["date", "<", `${year + 1}-01-01`]], skip: !year })

  const { lines, columns } = year ? balanceSheet(journals.data, accounts, year) : { lines: [], columns: [] }
  const width = columns.length
  const total = (...sections: string[]) => Array.from({ length: width }, (_, i) => round2(sections.reduce((s, sec) => s + sectionTotal(lines, sec, width)[i], 0)))
  const assets = total("current", "fixed")
  const liabEq = total("liabilities", "longterm", "equity")
  const difference = assets.map((v, i) => round2(v - liabEq[i]))

  const rows: StatementRow[] = []
  for (const section of BALANCE_LAYOUT) {
    rows.push({ kind: "header", label: section.label, values: [] })
    for (const l of lines.filter((x) => x.section === section.key)) rows.push({ kind: "line", label: l.label, values: l.values, accounts: l.accounts })
    rows.push({ kind: "total", label: `Total ${section.label.toLowerCase()}`, values: sectionTotal(lines, section.key, width) })
    if (section.key === "fixed") rows.push({ kind: "grand", label: "TOTAL ASET", values: assets })
  }
  rows.push({ kind: "grand", label: "TOTAL LIABILITAS + EKUITAS", values: liabEq })
  const loose = lines.find((l) => l.key === "unmapped")!
  if (loose?.values.some((v) => v)) rows.push({ kind: "line", label: loose.label, values: loose.values, accounts: loose.accounts, warn: true })
  rows.push({ kind: "grand", label: "Selisih (harus 0)", values: difference, warn: difference.some((v) => v) })

  const yearEnd = netByAccount(journals.data, "0000", `${year + 1}-01-01`)
  return (
    <>
      <YearField year={year} setYear={setYear} />
      <StatementTable
        rows={rows}
        columns={columns}
        accounts={accounts}
        accountValue={(code) => yearEnd.get(code) ?? 0}
        fileName={`Neraca_${year}.xlsx`}
        sheet={`Neraca ${year}`}
        loading={journals.loading}
      />
      <p className="text-xs text-muted-foreground">
        Saldo per akhir bulan. Baris diisi dari Baris laporan (NR..) di Daftar akun; laba ditahan = semua hasil tahun sebelumnya, laba tahun berjalan =
        Januari s.d. bulan itu. Angka akun di rincian = saldo debit − kredit per akhir tahun.
      </p>
    </>
  )
}
