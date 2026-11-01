"use client"

import { FileDownIcon } from "lucide-react"

import { MonthPicker, useMonth } from "@/components/month-picker"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table"
import { useHpp } from "@/hooks/use-hpp"
import { downloadExcel } from "@/lib/export"
import type { Hpp } from "@/lib/hpp"
import { cn, formatNumber } from "@/lib/utils"

type Line = [string, string, number | null, boolean?]

/** Same layout as the COGS sheet: raw material → work in process → finished goods. */
const layout = (h: Hpp): Line[] => [
  ["BAHAN BAKU", "", null, true],
  ["+/+", "Saldo awal", h.raw.begin],
  ["+/+", "Pembelian", h.raw.purchase],
  ["=/=", "Bahan tersedia", h.raw.available, true],
  ["-/-", "Dipakai ke WIP", h.raw.toWip],
  ["=/=", "Saldo akhir", h.raw.end, true],
  ["BARANG DALAM PROSES", "", null, true],
  ["+/+", "Saldo awal", h.wip.begin],
  ["+/+", "Produksi: bahan", h.raw.toWip],
  ["+/+", "Produksi: upah langsung", h.labour],
  ["+/+", "Produksi: overhead pabrik", h.overhead],
  ["=/=", "Total biaya produksi", h.wip.production, true],
  ["=/=", "WIP tersedia", h.wip.available, true],
  ["-/-", "Pindah ke barang jadi", h.wip.toFinished],
  ["=/=", "Saldo akhir", h.wip.end, true],
  ["BARANG JADI", "", null, true],
  ["+/+", "Saldo awal", h.finished.begin],
  ["+/+", "Harga pokok produksi", h.finished.manufactured],
  ["=/=", "Barang jadi tersedia", h.finished.available, true],
  ["-/-", "Harga pokok penjualan", h.finished.cogs],
  ["=/=", "Saldo akhir", h.finished.end, true],
  ["KAIN LOOM", "", null, true],
  ["", "Kain diproduksi (kg)", h.clothKg],
  ["", "Biaya produksi per kg kain", h.costPerKg, true],
]

export default function HppPage() {
  const { month, setMonth } = useMonth()
  const { hpp, loading } = useHpp(month)
  const lines = hpp ? layout(hpp) : []

  return (
    <>
      <div className="flex items-center gap-2">
        <MonthPicker month={month} setMonth={setMonth} />
        <Button
          variant="outline"
          className="ml-auto"
          disabled={!hpp}
          onClick={() => downloadExcel(`HPP_${month}.xlsx`, `HPP ${month}`, ["", "Keterangan", "Nilai"], lines.map(([sign, label, value]) => [sign || null, label || null, value]), [8, 34, 18])}
        >
          <FileDownIcon />
          Ekspor Excel
        </Button>
      </div>
      {loading ? (
        <Skeleton className="h-96 max-w-xl" />
      ) : (
        <div className="max-w-xl rounded-xl border">
          <Table>
            <TableBody>
              {lines.map(([sign, label, value, bold], i) => (
                <TableRow key={i} className={cn(bold && "font-semibold", value === null && "bg-muted/40")}>
                  <TableCell className="w-12 text-muted-foreground">{value === null ? "" : sign}</TableCell>
                  <TableCell>{value === null ? sign : label}</TableCell>
                  <TableCell className="text-right tabular-nums">{value === null ? "" : formatNumber(value)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <p className="max-w-xl text-xs text-muted-foreground">
        Bahan dari Nilai persediaan; upah langsung dan overhead dari akun dengan Baris laporan LR06 dan LR07; barang jadi dari Barang jadi dan HPP faktur
        penjualan; kg kain dari Panen roll.
      </p>
    </>
  )
}
