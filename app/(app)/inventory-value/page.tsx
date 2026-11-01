"use client"

import { useState } from "react"
import { FileDownIcon } from "lucide-react"
import { toast } from "sonner"

import { useCanCloseMonth } from "@/components/auth-provider"
import { DataTable, type Column } from "@/components/data-table"
import { MonthPicker, useMonth } from "@/components/month-picker"
import { Button } from "@/components/ui/button"
import { useCollection } from "@/hooks/use-collection"
import { useInventory } from "@/hooks/use-inventory"
import { INVENTORY_ACCOUNTS, INVENTORY_POSTINGS, JOURNALS, type InventoryPosting, type Journal } from "@/lib/collections"
import { downloadExcel } from "@/lib/export"
import { postMaterialUsed, type ValueRow } from "@/lib/inventory"
import { round2 } from "@/lib/journal"
import { PERIODS } from "@/lib/period"
import { formatNumber, monthRange } from "@/lib/utils"

type Row = ValueRow & { id: string; total?: boolean }
const NUMBERS = [
  ["beginKg", "Awal kg"],
  ["beginValue", "Awal nilai"],
  ["inKg", "Masuk kg"],
  ["inValue", "Masuk nilai"],
  ["usedKg", "Pakai kg"],
  ["usedValue", "Pakai nilai"],
  ["endKg", "Akhir kg"],
  ["endValue", "Akhir nilai"],
  ["avgCost", "Rata-rata/kg"],
] as const

export default function InventoryValuePage() {
  const canPost = useCanCloseMonth()
  const { month, setMonth } = useMonth()
  const { byMonth, loading, error } = useInventory(month)
  const [, end] = month ? monthRange(month) : ["", ""]
  const ledgerJournals = useCollection<Journal>(JOURNALS, { where: [["accounts", "array-contains", INVENTORY_ACCOUNTS.rawMaterial]] }).data
  const posted = useCollection<InventoryPosting>(INVENTORY_POSTINGS).data.find((p) => p.id === month)
  const closed = useCollection<{ id: string }>(PERIODS).data.some((p) => p.id === month)
  const [busy, setBusy] = useState(false)

  const rows: ValueRow[] = byMonth.get(month) ?? []
  const sum = (k: keyof ValueRow) => round2(rows.reduce((s, r) => s + (r[k] as number), 0))
  const totals: Row = { id: "total", total: true, material: "", name: "Total", beginKg: sum("beginKg"), beginValue: sum("beginValue"), inKg: sum("inKg"), inValue: sum("inValue"), usedKg: sum("usedKg"), usedValue: sum("usedValue"), consumedValue: sum("consumedValue"), endKg: sum("endKg"), endValue: sum("endValue"), avgCost: 0 }
  const data: Row[] = [...rows.map((r) => ({ ...r, id: r.material })), totals]
  const ledger = round2(ledgerJournals.reduce((s, j) => s + j.lines.filter((l) => l.account === INVENTORY_ACCOUNTS.rawMaterial && (l.date ?? j.date) < end).reduce((t, l) => t + l.debit - l.credit, 0), 0))

  const columns: Column<Row>[] = [
    { header: "Bahan", cell: (r) => <span className="whitespace-normal">{r.total ? "Total" : `${r.material} ${r.name}`}</span> },
    ...NUMBERS.map(([key, header]) => ({ header, cell: (r: Row) => (r.total && key === "avgCost" ? "" : formatNumber(r[key])), className: "text-right tabular-nums" })),
  ]

  async function postUsed() {
    if (!confirm(`Posting pemakaian bahan ${month}: ${formatNumber(totals.consumedValue)} (WIP 105201 debit / bahan baku 105101 kredit)?`)) return
    setBusy(true)
    await postMaterialUsed(month, totals.consumedValue)
      .then((number) => toast.success(`Pemakaian bahan ${month} diposting (${number}).`))
      .catch((err) => toast.error(err.message))
    setBusy(false)
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <MonthPicker month={month} setMonth={setMonth} />
        <Button
          variant="outline"
          className="ml-auto"
          disabled={loading}
          onClick={() => downloadExcel(`Nilai_persediaan_${month}.xlsx`, `Persediaan ${month}`, ["Bahan", ...NUMBERS.map(([, h]) => h)], data.map((r) => [r.total ? "Total" : `${r.material} ${r.name}`, ...NUMBERS.map(([k]) => r[k])]), [34, ...NUMBERS.map(() => 14)])}
        >
          <FileDownIcon />
          Ekspor Excel
        </Button>
      </div>
      <DataTable columns={columns} data={data} loading={loading} error={error} rowClassName={(r) => (r.total ? "bg-muted/50 font-semibold" : undefined)} />
      {!loading && (
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <span className={round2(totals.endValue - ledger) ? "font-medium text-destructive" : "font-medium text-green-600"}>
            Nilai akhir {formatNumber(totals.endValue)} · buku besar 105101 {formatNumber(ledger)}
            {round2(totals.endValue - ledger) ? ` · selisih ${formatNumber(round2(totals.endValue - ledger))}` : " · cocok"}
          </span>
          <span className="text-muted-foreground">Bahan terpakai (pemakaian + selisih opname): {formatNumber(totals.consumedValue)}</span>
          {posted ? (
            <span className="text-muted-foreground">Sudah diposting: {posted.number}</span>
          ) : (
            canPost && (
              <Button size="sm" onClick={postUsed} disabled={busy || !closed || !totals.consumedValue} title={closed ? undefined : "Tutup buku gudang bulan ini dulu"}>
                Posting pemakaian bahan
              </Button>
            )
          )}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Rata-rata tertimbang per bulan. Timbangan yang sudah dicocokkan dengan faktur dinilai dari faktur (baris yang dipetakan); yang belum, dengan rata-rata
        saat itu. Hasil cuci/recycle mengambil nilai bahan inputnya (termasuk susut). Posting hanya untuk bulan yang sudah tutup buku gudang, dan otomatis
        saat Tutup buku di Laporan stok bulanan.
      </p>
    </>
  )
}
