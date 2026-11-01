"use client"

import Link from "next/link"
import { TruckIcon } from "lucide-react"

import { DataTable, type Column } from "@/components/data-table"
import { Badge } from "@/components/ui/badge"
import { useCollection } from "@/hooks/use-collection"
import {
  CONDITIONS,
  DEPARTMENTS,
  MATERIALS,
  SUPPLIERS,
  WEIGHINGS,
  type Department,
  type Material,
  type Supplier,
  type Weighing,
} from "@/lib/collections"
import { formatNumber } from "@/lib/utils"

/** Below its minimum stock: danger. Dirty (still needs washing): warning. */
const isLow = (m: Material) => m.minStock != null && (m.stock ?? 0) < m.minStock

// `stock` is kept equal to the sum of the material's stock movements: it only ever
// changes together with a movement (lib/stock.ts) and is never typed in.
export default function StockPage() {
  const materials = useCollection<Material>(MATERIALS)
  const departments = useCollection<Department>(DEPARTMENTS).data
  const suppliers = useCollection<Supplier>(SUPPLIERS).data
  const onsite = useCollection<Weighing>(WEIGHINGS, { where: [["status", "==", "onsite"]] }).data

  const active = materials.data
    .filter((m) => m.active)
    .sort((a, b) => a.department.localeCompare(b.department) || a.code.localeCompare(b.code, undefined, { numeric: true }))
  const total = active.reduce((sum, m) => sum + (m.stock ?? 0), 0)
  const largest = Math.max(1, ...active.map((m) => m.stock ?? 0))
  const deptName = (code: string) => departments.find((d) => d.code === code)?.name || code || "Tanpa departemen"
  const supplierName = (code: string) => suppliers.find((s) => s.code === code)?.name ?? code

  const columns: Column<Material>[] = [
    {
      header: "Nama",
      cell: (m) => (
        <Link href={`/stock-card?material=${encodeURIComponent(m.code)}`} className="font-medium whitespace-normal underline-offset-4 hover:underline">
          {m.name}
        </Link>
      ),
    },
    { header: "Kode", cell: (m) => m.code },
    { header: "Kondisi", cell: (m) => <Badge variant="outline">{CONDITIONS[m.condition]}</Badge>, className: "hidden md:table-cell" },
    {
      header: "Saldo",
      className: "w-1/3",
      cell: (m) => (
        <div className="flex items-center gap-3">
          <span className="w-28 shrink-0 text-right font-medium tabular-nums">
            {formatNumber(m.stock ?? 0)} {m.unit}
          </span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-current" style={{ width: `${((m.stock ?? 0) / largest) * 100}%` }} />
          </div>
        </div>
      ),
    },
  ]

  return (
    <>
      {onsite.length > 0 && (
        <Link
          href="/weighings"
          className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 text-sm"
        >
          <TruckIcon className="size-4 text-amber-600" />
          <span className="font-medium">{onsite.length} truk masih di lokasi:</span>
          {onsite.map((t) => (
            <span key={t.id}>
              {t.plate} · {supplierName(t.supplier)}
            </span>
          ))}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-sm text-muted-foreground">Total stok semua bahan</div>
          <div className="text-3xl font-semibold tabular-nums">{formatNumber(total)} kg</div>
        </div>
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span className="text-amber-600">● Kotor, perlu dicuci</span>
          <span className="text-destructive">● Di bawah stok minimum</span>
        </div>
      </div>
      <DataTable
        columns={columns}
        {...materials}
        data={active}
        groupBy={(m) => deptName(m.department)}
        rowClassName={(m) => (isLow(m) ? "text-destructive" : m.condition === "dirty" ? "text-amber-600" : undefined)}
        empty="Belum ada bahan baku aktif."
      />
    </>
  )
}
