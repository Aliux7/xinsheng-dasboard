"use client"

import { useState } from "react"
import { FileDownIcon } from "lucide-react"

import { DataTable, type Column } from "@/components/data-table"
import { FilterSelect } from "@/components/filter-select"
import { MonthPicker, useMonth } from "@/components/month-picker"
import { Button } from "@/components/ui/button"
import { useCollection } from "@/hooks/use-collection"
import { DEPARTMENTS, MATERIALS, USAGES, type Department, type Material, type Usage } from "@/lib/collections"
import { downloadExcel } from "@/lib/export"
import { daysIn } from "@/lib/report"
import { round3 } from "@/lib/stock"
import { formatNumber } from "@/lib/utils"

type Row = { id: string; name: string; days: number[]; total: number; isTotal?: boolean }

const dash = (n: number) => (n ? formatNumber(n) : "–")

export default function UsageSummaryPage() {
  const { month, setMonth, where, skip } = useMonth()
  const [department, setDepartment] = useState("")
  const materials = useCollection<Material>(MATERIALS).data
  const departments = useCollection<Department>(DEPARTMENTS).data
  const usages = useCollection<Usage>(USAGES, { where, skip })

  const days = month ? daysIn(month) : 0
  const byMaterial = new Map<string, number[]>()
  for (const usage of usages.data) {
    if (department && usage.department !== department) continue
    const day = Number(usage.date.slice(8, 10)) - 1
    for (const line of usage.lines) {
      const row = byMaterial.get(line.material) ?? Array<number>(days).fill(0)
      row[day] = round3(row[day] + line.qty)
      byMaterial.set(line.material, row)
    }
  }

  const name = (code: string) => materials.find((m) => m.code === code)?.name ?? ""
  const rows: Row[] = [...byMaterial]
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    .map(([code, perDay]) => ({ id: code, name: `${code} ${name(code)}`, days: perDay, total: round3(perDay.reduce((s, n) => s + n, 0)) }))
  const dayTotals = Array.from({ length: days }, (_, d) => round3(rows.reduce((s, r) => s + r.days[d], 0)))
  const all: Row[] = rows.length
    ? [...rows, { id: "total", name: "Total", days: dayTotals, total: round3(dayTotals.reduce((s, n) => s + n, 0)), isTotal: true }]
    : []

  const columns: Column<Row>[] = [
    { header: "Bahan", cell: (r) => <span className="whitespace-nowrap">{r.name}</span>, className: "sticky left-0 bg-background" },
    ...Array.from({ length: days }, (_, d) => ({
      header: String(d + 1),
      cell: (r: Row) => dash(r.days[d]),
      className: "text-right tabular-nums text-xs",
    })),
    { header: "Total", cell: (r) => dash(r.total), className: "text-right font-medium tabular-nums" },
  ]

  const deptLabel = department ? departments.find((d) => d.code === department)?.name || department : "Semua"
  const exportExcel = () =>
    downloadExcel(
      `Rekap_pemakaian_${month}_${deptLabel}.xlsx`,
      `Pemakaian ${month}`,
      ["Bahan", ...Array.from({ length: days }, (_, d) => String(d + 1)), "Total"],
      all.map((r) => [r.name, ...r.days.map((n) => n || null), r.total]),
      [30, ...Array<number>(days).fill(7), 10]
    )

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <MonthPicker month={month} setMonth={setMonth} />
        <FilterSelect id="filter-department" value={department} onChange={setDepartment} rows={departments} allLabel="Semua departemen" />
        <Button variant="outline" className="ml-auto" onClick={exportExcel} disabled={!all.length}>
          <FileDownIcon />
          Ekspor Excel
        </Button>
      </div>
      <DataTable
        columns={columns}
        {...usages}
        data={all}
        rowClassName={(r) => (r.isTotal ? "bg-muted/50 font-semibold" : undefined)}
        empty="Belum ada pemakaian di bulan ini."
      />
    </>
  )
}
