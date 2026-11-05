"use client"

import { Suspense, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"

import { DataTable, type Column } from "@/components/data-table"
import { MonthPicker, shiftMonth } from "@/components/month-picker"
import { SimpleSelect } from "@/components/simple-select"
import { useCollection } from "@/hooks/use-collection"
import { INVENTORY_ITEMS, INVENTORY_MOVEMENTS, round3, type InventoryItem, type InventoryMovement } from "@/lib/inventory"
import { formatDay, formatNumber, today } from "@/lib/utils"

type Row = InventoryMovement & { balance?: number; total?: string }

const timeFormat = new Intl.DateTimeFormat("id-ID", { dateStyle: "short", timeStyle: "short" })

export default function InventoryMovementsPage() {
  // ?item= needs a Suspense boundary with cacheComponents.
  return (
    <Suspense>
      <Movements />
    </Suspense>
  )
}

/** Every stock movement of a month, or one item's stock card (all its movements, with the running balance). */
function Movements() {
  const router = useRouter()
  const itemId = useSearchParams().get("item") ?? ""
  const [month, setMonth] = useState(() => today().slice(0, 7))
  const items = useCollection<InventoryItem>(INVENTORY_ITEMS, { orderBy: "name" })
  const item = items.data.find((i) => i.id === itemId)
  const from = `${month}-01`
  const to = `${shiftMonth(month, 1)}-01`
  const moves = useCollection<InventoryMovement>(INVENTORY_MOVEMENTS, {
    where: itemId ? [["item", "==", itemId]] : [["date", ">=", from], ["date", "<", to]],
    skip: !month,
  })

  const sorted = [...moves.data].sort((a, b) => a.date.localeCompare(b.date) || a.savedAt.localeCompare(b.savedAt))
  const inMonth = sorted.filter((m) => m.date >= from && m.date < to)
  const opening = round3(sorted.filter((m) => m.date < from).reduce((s, m) => s + m.in - m.out, 0))
  const totalIn = round3(inMonth.reduce((s, m) => s + m.in, 0))
  const totalOut = round3(inMonth.reduce((s, m) => s + m.out, 0))

  // One item: running balance by date, between "Saldo awal" and "Saldo akhir" rows.
  let rows: Row[] = inMonth
  if (itemId) {
    let balance = opening
    rows = inMonth.map((m) => ({ ...m, balance: (balance = round3(balance + m.in - m.out)) }))
    const total = (label: string, balance: number) => ({ ...({} as InventoryMovement), id: label, total: label, balance })
    rows = [total("Saldo awal", opening), ...rows, total("Saldo akhir", round3(opening + totalIn - totalOut))]
  }

  const unit = (m: Row) => item?.unit ?? m.unit
  const columns: Column<Row>[] = [
    { header: "Tanggal", cell: (m) => (m.total ? <span className="font-medium">{m.total}</span> : formatDay(m.date)) },
    ...(itemId
      ? []
      : [
          {
            header: "Bahan baku",
            cell: (m: Row) => (
              <span className="font-medium">
                {m.itemCode && <span className="text-muted-foreground">{m.itemCode} · </span>}
                {m.itemName}
              </span>
            ),
          },
        ]),
    { header: "Masuk", cell: (m) => (m.in ? `${formatNumber(m.in)} ${unit(m)}` : ""), className: "text-right tabular-nums text-success whitespace-nowrap" },
    { header: "Keluar", cell: (m) => (m.out ? `${formatNumber(m.out)} ${unit(m)}` : ""), className: "text-right tabular-nums whitespace-nowrap" },
    ...(itemId
      ? [{ header: "Saldo", cell: (m: Row) => `${formatNumber(m.balance)} ${unit(m)}`, className: "text-right font-medium tabular-nums whitespace-nowrap" }]
      : [{ header: "Stok setelahnya", cell: (m: Row) => `${formatNumber(m.stockAfter)} ${unit(m)}`, className: "text-right tabular-nums whitespace-nowrap text-muted-foreground" }]),
    { header: "Keterangan", cell: (m) => <span className="whitespace-normal">{m.note}</span> },
    {
      header: "Dicatat oleh",
      cell: (m) =>
        !m.total && (
          <div className="text-xs">
            <div>{m.by?.email}</div>
            <div className="text-muted-foreground">{m.savedAt && timeFormat.format(new Date(m.savedAt))}</div>
          </div>
        ),
      className: "hidden md:table-cell",
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-full sm:w-72">
          <SimpleSelect
            id="item"
            value={itemId}
            onChange={(id) => router.replace(id ? `/inventory-movements?item=${id}` : "/inventory-movements")}
            options={[{ value: "", label: "Semua bahan baku" }, ...items.data.map((i) => ({ value: i.id, label: `${i.code ? `${i.code} · ` : ""}${i.name} (${i.unit})` }))]}
            placeholder="Semua bahan baku"
          />
        </div>
        <MonthPicker month={month} onChange={setMonth} />
        <span className="text-sm text-muted-foreground sm:ml-auto">
          {inMonth.length} pergerakan
          {item && (
            <>
              {" "}
              · masuk <strong className="text-success">{formatNumber(totalIn)}</strong> · keluar <strong>{formatNumber(totalOut)}</strong> {item.unit} · stok sekarang{" "}
              <strong>
                {formatNumber(item.stock)} {item.unit}
              </strong>
            </>
          )}
        </span>
      </div>
      <DataTable
        columns={columns}
        {...moves}
        data={rows}
        empty="Belum ada pergerakan stok bulan ini."
        rowClassName={(m) => (m.total ? "bg-brand-soft/60 font-medium text-brand" : undefined)}
      />
      <p className="text-xs text-muted-foreground">
        Pergerakan tidak bisa diubah atau dihapus. Kalau salah input, catat pergerakan kebalikannya (mis. keluar untuk membatalkan masuk) dengan
        keterangan koreksi. Setiap pergerakan juga tercatat di Riwayat perubahan.
      </p>
    </div>
  )
}
