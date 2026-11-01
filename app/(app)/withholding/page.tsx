"use client"

import { FileDownIcon } from "lucide-react"
import { toast } from "sonner"

import { DataTable, type Column } from "@/components/data-table"
import { MonthPicker, useMonth } from "@/components/month-picker"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useCollection } from "@/hooks/use-collection"
import { PURCHASE_INVOICES, WITHHOLDING, type PurchaseInvoice } from "@/lib/collections"
import { downloadExcel } from "@/lib/export"
import { round2 } from "@/lib/journal"
import { markWithholdingPaid } from "@/lib/purchase"
import { formatDay, formatNumber, today } from "@/lib/utils"

type Row = PurchaseInvoice & { total?: string }

export default function WithholdingPage() {
  const { month, setMonth, where, skip } = useMonth()
  const invoices = useCollection<PurchaseInvoice>(PURCHASE_INVOICES, { where, skip })
  const list = invoices.data.filter((i) => i.pph > 0).sort((a, b) => a.withholding.localeCompare(b.withholding) || a.date.localeCompare(b.date))
  const types = [...new Set(list.map((i) => i.withholding))]
  const totals = types.map((t) => ({ ...list.find((i) => i.withholding === t)!, id: `total-${t}`, total: `Total ${WITHHOLDING[t]}`, dpp: round2(list.filter((i) => i.withholding === t).reduce((s, i) => s + i.dpp, 0)), pph: round2(list.filter((i) => i.withholding === t).reduce((s, i) => s + i.pph, 0)) }))

  function pay(i: PurchaseInvoice) {
    const date = prompt(`Tanggal setor PPh ${i.number} (YYYY-MM-DD):`, today())
    if (!date) return
    const proof = prompt("Nomor bukti setor / NTPN:")?.trim()
    if (proof)
      markWithholdingPaid(i.id, date, proof)
        .then(() => toast.success(`Setoran PPh ${i.number} dicatat.`))
        .catch((err) => toast.error(err.message))
  }

  const columns: Column<Row>[] = [
    { header: "Pemasok", cell: (i) => (i.total ? <span className="font-semibold">{i.total}</span> : <span className="whitespace-normal">{i.supplierName}</span>) },
    { header: "Jenis", cell: (i) => (i.total ? "" : WITHHOLDING[i.withholding]) },
    { header: "DPP", cell: (i) => formatNumber(i.dpp), className: "text-right tabular-nums" },
    { header: "Tarif", cell: (i) => (i.total ? "" : `${formatNumber(i.whtPct)}%`), className: "text-right tabular-nums" },
    { header: "PPh", cell: (i) => formatNumber(i.pph), className: "text-right font-medium tabular-nums" },
    { header: "Faktur", cell: (i) => (i.total ? "" : `${i.number} · ${formatDay(i.date)}`), className: "hidden md:table-cell" },
    {
      header: "Status setor",
      cell: (i) =>
        i.total ? "" : i.whtPaid ? (
          <Badge variant="outline">Disetor {formatDay(i.whtPaid.date)} · {i.whtPaid.proof}</Badge>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => pay(i)}>
            Tandai disetor
          </Button>
        ),
    },
  ]
  const data: Row[] = [...list, ...totals]

  return (
    <>
      <div className="flex items-center gap-2">
        <MonthPicker month={month} setMonth={setMonth} />
        <Button
          variant="outline"
          className="ml-auto"
          disabled={invoices.loading}
          onClick={() =>
            downloadExcel(
              `PPh_dipotong_${month}.xlsx`,
              `PPh ${month}`,
              ["Pemasok", "Jenis", "DPP", "Tarif %", "PPh", "Faktur", "Tanggal faktur", "Tanggal setor", "Bukti setor"],
              data.map((i) => (i.total ? [i.total, null, i.dpp, null, i.pph, null, null, null, null] : [i.supplierName, WITHHOLDING[i.withholding], i.dpp, i.whtPct, i.pph, i.number, i.date, i.whtPaid?.date ?? null, i.whtPaid?.proof ?? null])),
              [30, 10, 16, 8, 14, 18, 12, 12, 20]
            )
          }
        >
          <FileDownIcon />
          Ekspor Excel
        </Button>
      </div>
      <DataTable columns={columns} {...invoices} data={data} rowClassName={(i) => (i.total ? "bg-muted/50" : undefined)} empty="Tidak ada PPh dipotong di bulan ini." />
    </>
  )
}
