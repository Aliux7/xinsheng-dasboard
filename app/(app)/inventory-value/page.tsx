"use client"

import { useState } from "react"
import Link from "next/link"

import { DataTable, type Column } from "@/components/data-table"
import { MonthPicker } from "@/components/month-picker"
import { Badge } from "@/components/ui/badge"
import { useCollection } from "@/hooks/use-collection"
import { useLedger } from "@/hooks/use-ledger"
import { round2 } from "@/lib/bank-book"
import { monthValues, valueMovements, type ItemMonth } from "@/lib/costing"
import { INVENTORY_ITEMS, INVENTORY_MOVEMENTS, type InventoryItem, type InventoryMovement } from "@/lib/inventory"
import { netByAccount, nextMonth } from "@/lib/ledger"
import { cn, formatNumber, today } from "@/lib/utils"

type Row = ItemMonth & { id: string }

const pair = (qty: number, value: number, unit: string) =>
  qty || value ? (
    <div className="whitespace-nowrap">
      <div>{formatNumber(value)}</div>
      <div className="text-xs text-muted-foreground">
        {formatNumber(qty)} {unit}
      </div>
    </div>
  ) : (
    ""
  )

/** Each item's quantity and rupiah value over a month (weighted average), and each inventory account against the ledger. */
export default function InventoryValuePage() {
  const ledger = useLedger()
  const items = useCollection<InventoryItem>(INVENTORY_ITEMS, { orderBy: "name" })
  const movements = useCollection<InventoryMovement>(INVENTORY_MOVEMENTS)
  const [month, setMonth] = useState(() => today().slice(0, 7))

  const months = monthValues(items.data, valueMovements(movements.data), month).filter((m) => m.begin.qty || m.in.qty || m.usage.qty || m.otherOut.qty || m.end.qty)
  const rows: Row[] = months
    .map((m) => ({ ...m, id: m.item.id }))
    .sort((a, b) => (a.item.account ?? "~").localeCompare(b.item.account ?? "~") || (a.item.code ?? "").localeCompare(b.item.code ?? "", undefined, { numeric: true }))
  const end = `${nextMonth(month)}-01`
  const balances = netByAccount(ledger.journals, "", end)
  const posted = ledger.journals.some((j) => j.id === `HPP-${month}`)
  const accounts = [...new Set([...ledger.accounts.filter((a) => a.link === "inventory").map((a) => a.code), ...rows.map((r) => r.item.account ?? "")])]
  const check = accounts.map((code) => {
    const stock = round2(rows.filter((r) => (r.item.account ?? "") === code).reduce((s, r) => s + r.end.value, 0))
    const book = code ? (balances.get(code) ?? 0) : 0
    return { code, stock, book, diff: round2(book - stock) }
  })

  const columns: Column<Row>[] = [
    {
      header: "Bahan baku",
      cell: (r) => (
        <Link className="hover:underline" href={`/inventory-movements?item=${r.item.id}`}>
          <span className="text-muted-foreground">{r.item.code} · </span>
          {r.item.name}
        </Link>
      ),
    },
    { header: "Awal", cell: (r) => pair(r.begin.qty, r.begin.value, r.item.unit), className: "text-right tabular-nums" },
    { header: "Masuk", cell: (r) => pair(r.in.qty, r.in.value, r.item.unit), className: "text-right tabular-nums text-success" },
    { header: "Pemakaian", cell: (r) => pair(r.usage.qty, r.usage.value, r.item.unit), className: "text-right tabular-nums" },
    { header: "Keluar lain", cell: (r) => pair(r.otherOut.qty, r.otherOut.value, r.item.unit), className: "hidden text-right tabular-nums lg:table-cell" },
    { header: "Akhir", cell: (r) => pair(r.end.qty, r.end.value, r.item.unit), className: "text-right font-medium tabular-nums" },
    { header: "Rata-rata", cell: (r) => (r.end.qty ? formatNumber(round2(r.end.value / r.end.qty)) : ""), className: "text-right tabular-nums text-muted-foreground" },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <MonthPicker month={month} onChange={setMonth} />
        <span className="text-sm text-muted-foreground">Nilai rata-rata tertimbang; pemakaian = stok keluar yang dicatat di Stok bahan baku.</span>
      </div>
      <DataTable
        columns={columns}
        data={rows}
        loading={items.loading || movements.loading}
        error={items.error ?? movements.error}
        empty="Tidak ada pergerakan atau saldo bahan baku bulan ini."
        groupBy={(r) => (r.item.account ? ledger.label(r.item.account) : "Belum ada akun persediaan")}
      />
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">Cocokkan dengan buku besar (akhir bulan)</h2>
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="px-3 py-2 font-medium">Akun persediaan</th>
                <th className="px-3 py-2 text-right font-medium">Nilai stok</th>
                <th className="px-3 py-2 text-right font-medium">Saldo buku besar</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {check.map((c) => (
                <tr key={c.code || "none"} className="border-b last:border-0">
                  <td className="px-3 py-2">{c.code ? ledger.label(c.code) : "Belum ada akun persediaan"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatNumber(c.stock)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{c.code ? formatNumber(c.book) : "—"}</td>
                  <td className={cn("px-3 py-2", c.diff && "text-warning")}>
                    {!c.diff ? (
                      <Badge variant="success">Cocok</Badge>
                    ) : (
                      <span className="text-xs">
                        Selisih {formatNumber(c.diff)}.{" "}
                        {!posted && rows.some((r) => r.usage.value) ? "HPP bulan ini belum diposting." : "Periksa saldo awal dan nilai stok awal."}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
