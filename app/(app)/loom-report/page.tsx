"use client"

import { useState } from "react"
import { FileDownIcon, LockIcon } from "lucide-react"
import { toast } from "sonner"

import { useCanCloseMonth } from "@/components/auth-provider"
import { DataTable, type Column } from "@/components/data-table"
import { MonthPicker, useMonth } from "@/components/month-picker"
import { Button } from "@/components/ui/button"
import { useCollection } from "@/hooks/use-collection"
import { CLOTH_GRADES, ROLLS, type ClothGrade, type Roll } from "@/lib/collections"
import { downloadSheets } from "@/lib/export"
import { closeLoomMonth, loomMonth, sumQty, type GradeRow, type LoomPeriod, type MachineRow, type Qty } from "@/lib/loom-report"
import { LOOM_PERIODS } from "@/lib/rolls"
import { round3 } from "@/lib/stock"
import { formatDate, formatNumber } from "@/lib/utils"

const PARTS = [
  ["begin", "Awal"],
  ["produced", "Produksi"],
  ["issued", "Keluar"],
  ["end", "Akhir"],
] as const

type Row = GradeRow & { id: string; total?: boolean }
const qtyCells = (q: Qty) => [q.rolls, q.kg, q.metres]

export default function LoomReportPage() {
  const canClose = useCanCloseMonth()
  const { month, setMonth, skip } = useMonth()
  const rolls = useCollection<Roll>(ROLLS)
  const grades = useCollection<ClothGrade>(CLOTH_GRADES).data
  const periods = useCollection<LoomPeriod>(LOOM_PERIODS)
  const closed = periods.data.find((p) => p.id === month)
  const [closing, setClosing] = useState(false)

  const report = closed ?? (skip ? { grades: [], machines: [] } : loomMonth(month, rolls.data, grades))
  const totals = Object.fromEntries(PARTS.map(([key]) => [key, sumQty(report.grades.map((g) => g[key]))])) as Record<(typeof PARTS)[number][0], Qty>
  const gradeRows: Row[] = [
    ...report.grades.map((g) => ({ ...g, id: g.grade })),
    { grade: "", name: "Total", ...totals, id: "total", total: true },
  ]
  const machineTotal = { machine: "Total", rolls: report.machines.reduce((s, m) => s + m.rolls, 0), kg: round3(report.machines.reduce((s, m) => s + m.kg, 0)) }
  const loading = rolls.loading || periods.loading

  const gradeColumns: Column<Row>[] = [
    { header: "Tipe kain", cell: (r) => r.name },
    ...PARTS.flatMap(([key, label]) => [
      { header: `${label} roll`, cell: (r: Row) => formatNumber(r[key].rolls), className: "text-right tabular-nums" },
      { header: `${label} kg`, cell: (r: Row) => formatNumber(r[key].kg), className: "text-right tabular-nums" },
      { header: `${label} m`, cell: (r: Row) => formatNumber(r[key].metres), className: "text-right tabular-nums" },
    ]),
  ]
  const machineColumns: Column<MachineRow & { id: string; total?: boolean }>[] = [
    { header: "Mesin", cell: (m) => m.machine },
    { header: "Roll", cell: (m) => formatNumber(m.rolls), className: "text-right tabular-nums" },
    { header: "Kg", cell: (m) => formatNumber(m.kg), className: "text-right tabular-nums" },
  ]

  async function close() {
    if (!confirm(`Tutup bulan loom ${month}? Angka disimpan dan roll bertanggal di bulan ini tidak bisa ditambah atau dikeluarkan lagi.`)) return
    setClosing(true)
    await closeLoomMonth(month, { grades: report.grades, machines: report.machines })
      .then(() => toast.success(`Bulan loom ${month} ditutup.`))
      .catch((err) => toast.error(err.message))
    setClosing(false)
  }

  const exportExcel = () =>
    downloadSheets(`Laporan_loom_${month}.xlsx`, [
      {
        name: "Per tipe kain",
        header: ["Tipe kain", ...PARTS.flatMap(([, l]) => [`${l} roll`, `${l} kg`, `${l} m`])],
        rows: gradeRows.map((r) => [r.name, ...PARTS.flatMap(([key]) => qtyCells(r[key]))]),
        widths: [16, ...Array<number>(12).fill(11)],
      },
      {
        name: "Per mesin",
        header: ["Mesin", "Roll", "Kg"],
        rows: [...report.machines, machineTotal].map((m) => [m.machine, m.rolls, m.kg]),
        widths: [10, 8, 12],
      },
    ])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <MonthPicker month={month} setMonth={setMonth} />
        <div className="ml-auto flex gap-2">
          <Button variant="outline" onClick={exportExcel} disabled={loading || !month}>
            <FileDownIcon />
            Ekspor Excel
          </Button>
          {canClose && !closed && (
            <Button onClick={close} disabled={loading || closing || !month}>
              <LockIcon />
              Tutup buku
            </Button>
          )}
        </div>
      </div>
      {closed && (
        <p className="flex items-center gap-2 rounded-xl border bg-muted/50 p-3 text-sm">
          <LockIcon className="size-4" />
          Bulan loom ini sudah ditutup oleh <span className="font-medium">{closed.closedBy.email}</span> pada {formatDate(closed.closedAt)}.
          Angka di bawah adalah angka saat ditutup.
        </p>
      )}
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Per tipe kain</h2>
        <DataTable
          columns={gradeColumns}
          data={gradeRows}
          loading={loading}
          error={rolls.error ?? periods.error}
          rowClassName={(r) => (r.total ? "bg-muted/50 font-semibold" : undefined)}
        />
      </section>
      <section className="flex max-w-md flex-col gap-3">
        <h2 className="text-lg font-semibold">Produksi per mesin</h2>
        <DataTable
          columns={machineColumns}
          data={[...report.machines.map((m) => ({ ...m, id: m.machine, total: false })), { ...machineTotal, id: "total", total: true }]}
          loading={loading}
          error={null}
          rowClassName={(m) => (m.total ? "bg-muted/50 font-semibold" : undefined)}
          empty="Belum ada produksi di bulan ini."
        />
      </section>
    </div>
  )
}
