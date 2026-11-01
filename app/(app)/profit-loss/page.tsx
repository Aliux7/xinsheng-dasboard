"use client"

import { StatementTable, type StatementRow } from "@/components/statement-table"
import { YearField, useYear } from "@/components/year-field"
import { useCollection } from "@/hooks/use-collection"
import { ACCOUNTS, JOURNALS, type Account, type Journal } from "@/lib/collections"
import { round2 } from "@/lib/journal"
import { PNL_LAYOUT, netByAccount, profitAndLoss, sectionTotal } from "@/lib/statements"

export default function ProfitLossPage() {
  const { year, setYear } = useYear()
  const accounts = useCollection<Account>(ACCOUNTS).data
  const journals = useCollection<Journal>(JOURNALS, { where: [["date", ">=", `${year}-01-01`], ["date", "<", `${year + 1}-01-01`]], skip: !year })

  const { lines, columns } = year ? profitAndLoss(journals.data, accounts, year) : { lines: [], columns: [] }
  const width = columns.length
  const t = (key: string) => sectionTotal(lines, key, width)
  const gross = t("revenue").map((v, i) => round2(v - t("cost")[i]))
  const loose = lines.find((l) => l.key === "unmapped")
  const net = gross.map((v, i) => round2(v - t("selling")[i] - t("ga")[i] + t("other")[i] - (loose?.values[i] ?? 0)))

  const rows: StatementRow[] = []
  for (const section of PNL_LAYOUT) {
    rows.push({ kind: "header", label: section.label, values: [] })
    for (const l of lines.filter((x) => x.section === section.key)) rows.push({ kind: "line", label: l.label, values: l.values, accounts: l.accounts })
    rows.push({ kind: "total", label: `Total ${section.label.toLowerCase()}`, values: t(section.key) })
    if (section.key === "cost") rows.push({ kind: "grand", label: "LABA KOTOR", values: gross })
  }
  if (loose?.values.some((v) => v)) rows.push({ kind: "line", label: loose.label, values: loose.values, accounts: loose.accounts, warn: true })
  rows.push({ kind: "grand", label: "LABA (RUGI) BERSIH SEBELUM PAJAK", values: net })

  const yearNet = netByAccount(journals.data, `${year}-01-01`, `${year + 1}-01-01`)
  return (
    <>
      <YearField year={year} setYear={setYear} />
      <StatementTable
        rows={rows}
        columns={columns}
        accounts={accounts}
        accountValue={(code) => yearNet.get(code) ?? 0}
        fileName={`Laba_rugi_${year}.xlsx`}
        sheet={`Laba rugi ${year}`}
        loading={journals.loading}
      />
      <p className="text-xs text-muted-foreground">
        Sebelum pajak penghasilan badan; perlu ditinjau akuntan. Baris diisi dari Baris laporan (LR..) di Daftar akun. Pendapatan dan lain-lain: kredit
        positif; biaya: debit positif. Angka akun di rincian = debit − kredit setahun.
      </p>
    </>
  )
}
