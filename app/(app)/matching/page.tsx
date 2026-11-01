"use client"

import { CheckIcon } from "lucide-react"
import { toast } from "sonner"

import { useIsAdmin } from "@/components/auth-provider"
import { DataTable, type Column } from "@/components/data-table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useCollection } from "@/hooks/use-collection"
import { useToday } from "@/hooks/use-today"
import { daysBetween } from "@/lib/aging"
import { PURCHASE_INVOICES, SUPPLIERS, WEIGHINGS, type PurchaseInvoice, type Supplier, type Weighing } from "@/lib/collections"
import { round2 } from "@/lib/journal"
import { approveMatch, matchDifference } from "@/lib/purchase"
import { formatDay, formatNumber } from "@/lib/utils"

type SupplierRow = { id: string; name: string; count: number; kg: number; oldest: number }

export default function MatchingPage() {
  const isAdmin = useIsAdmin()
  const today = useToday()
  const suppliers = useCollection<Supplier>(SUPPLIERS).data
  const weighings = useCollection<Weighing>(WEIGHINGS, { where: [["status", "==", "stocked"]] })
  const invoices = useCollection<PurchaseInvoice>(PURCHASE_INVOICES, { where: [["matchStatus", "in", ["pending", "approved"]]] })

  const notInvoiced = weighings.data.filter((w) => !w.invoiceId)
  const bySupplier: SupplierRow[] = [...new Set(notInvoiced.map((w) => w.supplier))].map((code) => {
    const these = notInvoiced.filter((w) => w.supplier === code)
    return {
      id: code,
      name: suppliers.find((s) => s.code === code)?.name ?? code,
      count: these.length,
      kg: round2(these.reduce((s, w) => s + (w.net ?? 0), 0)),
      oldest: today ? Math.max(...these.map((w) => daysBetween(w.date, today))) : 0,
    }
  })

  const supplierColumns: Column<SupplierRow>[] = [
    { header: "Pemasok", cell: (r) => r.name },
    { header: "Timbangan", cell: (r) => r.count, className: "text-right tabular-nums" },
    { header: "Kg", cell: (r) => formatNumber(r.kg), className: "text-right tabular-nums" },
    { header: "Tertua (hari)", cell: (r) => <span className={r.oldest > 30 ? "font-medium text-amber-600" : undefined}>{r.oldest}</span>, className: "text-right tabular-nums" },
  ]
  const weighingColumns: Column<Weighing>[] = [
    { header: "No.", cell: (w) => <span className="font-medium">{w.number}</span> },
    { header: "Tanggal", cell: (w) => formatDay(w.date) },
    { header: "Umur (hari)", cell: (w) => (today ? daysBetween(w.date, today) : ""), className: "text-right tabular-nums" },
    { header: "Pemasok", cell: (w) => suppliers.find((s) => s.code === w.supplier)?.name ?? w.supplier },
    { header: "Bahan", cell: (w) => w.material },
    { header: "Neto", cell: (w) => `${formatNumber(w.net)} kg`, className: "text-right tabular-nums" },
  ]
  const invoiceColumns: Column<PurchaseInvoice>[] = [
    { header: "Faktur", cell: (i) => <span className="font-medium">{i.number}</span> },
    { header: "Pemasok", cell: (i) => i.supplierName },
    { header: "Difaktur", cell: (i) => `${formatNumber(i.invoicedKg)} kg`, className: "text-right tabular-nums" },
    { header: "Ditimbang", cell: (i) => `${formatNumber(i.weighedKg)} kg`, className: "text-right tabular-nums" },
    { header: "Selisih", cell: (i) => `${formatNumber(round2((i.invoicedKg ?? 0) - (i.weighedKg ?? 0)))} kg (${formatNumber(round2(matchDifference(i.invoicedKg ?? 0, i.weighedKg ?? 0) * 100))}%)`, className: "text-right tabular-nums" },
    {
      header: "Status",
      cell: (i) =>
        i.matchStatus === "approved" ? (
          <Badge variant="outline">Disetujui {i.matchApprovedBy?.email}</Badge>
        ) : isAdmin ? (
          <Button size="sm" variant="ghost" className="hover:bg-primary hover:text-primary-foreground" onClick={() => approveMatch(i.id).then(() => toast.success(`Pencocokan ${i.number} disetujui.`)).catch((e) => toast.error(e.message))}>
            <CheckIcon /> Setujui
          </Button>
        ) : (
          <Badge variant="secondary">Menunggu Admin</Badge>
        ),
    },
  ]

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">Timbangan belum difakturkan</h2>
        <DataTable columns={supplierColumns} {...weighings} data={bySupplier} empty="Semua timbangan sudah difakturkan." />
        <DataTable columns={weighingColumns} {...weighings} data={[...notInvoiced].sort((a, b) => a.date.localeCompare(b.date))} empty="—" />
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">Faktur dengan selisih timbangan</h2>
        <DataTable columns={invoiceColumns} {...invoices} data={invoices.data} empty="Tidak ada selisih di atas toleransi." />
      </section>
    </div>
  )
}
