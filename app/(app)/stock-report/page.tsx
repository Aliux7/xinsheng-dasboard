"use client"

import { useState } from "react"
import { FileDownIcon, LockIcon } from "lucide-react"
import { toast } from "sonner"

import { useCanCloseMonth } from "@/components/auth-provider"
import { DataTable, type Column } from "@/components/data-table"
import { MonthPicker, useMonth } from "@/components/month-picker"
import { Button } from "@/components/ui/button"
import { useCollection } from "@/hooks/use-collection"
import { useInventory } from "@/hooks/use-inventory"
import {
  DEPARTMENTS,
  MATERIALS,
  STOCK_COUNTS,
  STOCK_MOVEMENTS,
  WEIGHINGS,
  type Department,
  type Material,
  type StockCount,
  type StockMovement,
  type Weighing,
} from "@/lib/collections"
import { downloadExcel } from "@/lib/export"
import { postMaterialUsed, type ValueRow } from "@/lib/inventory"
import { PERIODS, type MonthRow, type Period } from "@/lib/period"
import { closeMonth, monthRows, previousMonth, totalsOf } from "@/lib/report"
import { formatDate, formatNumber, monthRange } from "@/lib/utils"

type Row = MonthRow & { id: string; total?: boolean }

const NUMBERS = [
  ["begin", "Awal"],
  ["in", "Masuk"],
  ["used", "Pakai"],
  ["shrinkage", "Susut cuci"],
  ["adjustment", "Penyesuaian"],
  ["end", "Akhir"],
] as const

export default function StockReportPage() {
  const canClose = useCanCloseMonth()
  const { month, setMonth, where, skip } = useMonth()
  const materials = useCollection<Material>(MATERIALS).data
  const departments = useCollection<Department>(DEPARTMENTS).data
  const periods = useCollection<Period>(PERIODS)
  const closed = periods.data.find((p) => p.id === month)
  const previous = periods.data.find((p) => p.id === previousMonth(month))

  // A closed month shows its saved figures; otherwise they're worked out from the movements.
  const live = !closed && !periods.loading && !skip
  const moves = useCollection<StockMovement>(STOCK_MOVEMENTS, { where, skip: !live })
  const [start] = month ? monthRange(month) : [""]
  const earlier = useCollection<StockMovement>(STOCK_MOVEMENTS, { where: [["date", "<", start]], skip: !live || !!previous })
  // Things that can't be finished once the month is locked.
  const onsite = useCollection<Weighing>(WEIGHINGS, { where: [["status", "==", "onsite"]] }).data.filter((t) => t.date.startsWith(month))
  const waiting = useCollection<StockCount>(STOCK_COUNTS, { where: [["status", "==", "pending"]] }).data.filter((c) => c.date.startsWith(month))
  const [closing, setClosing] = useState(false)
  const inventory = useInventory(closed ? "" : month)

  const rows: MonthRow[] = closed
    ? closed.rows
    : monthRows(materials, departments, moves.data, previous ? { closed: previous.rows } : { earlier: earlier.data })
  const totals = totalsOf(rows)
  const loading = periods.loading || (live && (moves.loading || (!previous && earlier.loading)))
  const tableRows: Row[] = [
    ...rows.map((r) => ({ ...r, id: r.material })),
    { id: "total", material: "", name: "Total", department: "", unit: "kg", ...totals, total: true },
  ]

  const columns: Column<Row>[] = [
    { header: "Kode", cell: (r) => r.material },
    { header: "Nama", cell: (r) => <span className="whitespace-normal">{r.name}</span> },
    { header: "Departemen", cell: (r) => r.department },
    ...NUMBERS.map(([key, header]) => ({
      header,
      cell: (r: Row) => formatNumber(r[key]),
      className: `text-right tabular-nums ${key === "end" ? "font-medium" : ""}`,
    })),
  ]

  async function close() {
    if (onsite.length) return toast.error(`Masih ada ${onsite.length} truk di lokasi dengan tanggal ${month}. Selesaikan atau batalkan dulu.`)
    if (waiting.length) return toast.error(`Masih ada ${waiting.length} stok opname menunggu persetujuan Admin di bulan ${month}.`)
    if (!confirm(`Tutup buku ${month}? Angka disimpan dan semua transaksi bertanggal di bulan ini dikunci.`)) return
    setClosing(true)
    try {
      await closeMonth(month, rows)
      toast.success(`Bulan ${month} ditutup.`)
      // Then post the month's raw material used (Nilai persediaan) automatically.
      const consumed = (inventory.byMonth.get(month) ?? []).reduce((s: number, r: ValueRow) => s + r.consumedValue, 0)
      if (consumed > 0) {
        const number = await postMaterialUsed(month, consumed)
        toast.success(`Pemakaian bahan ${month} diposting (${number}).`)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
    setClosing(false)
  }

  const exportExcel = () =>
    downloadExcel(
      `Laporan_stok_${month}.xlsx`,
      `Stok ${month}`,
      ["Kode", "Nama", "Departemen", ...NUMBERS.map(([, header]) => `${header} (kg)`)],
      tableRows.map((r) => [r.material || null, r.name, r.department || null, ...NUMBERS.map(([key]) => r[key])]),
      [12, 30, 16, 12, 12, 12, 12, 12, 12]
    )

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <MonthPicker month={month} setMonth={setMonth} />
        <div className="ml-auto flex gap-2">
          <Button variant="outline" onClick={exportExcel} disabled={loading || !month}>
            <FileDownIcon />
            Unduh Excel
          </Button>
          {canClose && !closed && (
            <Button onClick={close} disabled={loading || inventory.loading || closing || !month}>
              <LockIcon />
              Tutup buku
            </Button>
          )}
        </div>
      </div>
      {closed && (
        <p className="flex items-center gap-2 rounded-xl border bg-muted/50 p-3 text-sm">
          <LockIcon className="size-4" />
          Bulan ini sudah ditutup oleh <span className="font-medium">{closed.closedBy.email}</span> pada{" "}
          {formatDate(closed.closedAt as never)}. Angka di bawah adalah angka saat ditutup.
        </p>
      )}
      <DataTable
        columns={columns}
        data={tableRows}
        loading={loading}
        error={moves.error ?? earlier.error ?? periods.error}
        rowClassName={(r) => (r.total ? "bg-muted/50 font-semibold" : undefined)}
        empty="Belum ada data."
      />
    </>
  )
}
