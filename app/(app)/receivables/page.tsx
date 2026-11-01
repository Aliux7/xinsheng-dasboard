"use client"

import { FileDownIcon } from "lucide-react"

import { AgingPage } from "@/components/aging-page"
import { DataTable } from "@/components/data-table"
import { MonthPicker, useMonth } from "@/components/month-picker"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useCollection } from "@/hooks/use-collection"
import { SALES_ACCOUNTS, SALES_INVOICES, type SalesInvoice } from "@/lib/collections"
import { downloadExcel } from "@/lib/export"
import { round2 } from "@/lib/journal"
import { formatNumber } from "@/lib/utils"

export default function ReceivablesPage() {
  const invoices = useCollection<SalesInvoice>(SALES_INVOICES)
  return (
    <Tabs defaultValue="aging" className="gap-4">
      <TabsList>
        <TabsTrigger value="aging">Umur piutang</TabsTrigger>
        <TabsTrigger value="sales">Daftar penjualan</TabsTrigger>
      </TabsList>
      <TabsContent value="aging" className="flex flex-col gap-4">
        <AgingPage
          docs={invoices.data.map((i) => ({ id: i.id, number: i.number, party: i.customer, partyName: i.customerName, date: i.date, dueDate: i.dueDate, total: i.total, payments: i.payments }))}
          loading={invoices.loading}
          accounts={[SALES_ACCOUNTS.receivable, SALES_ACCOUNTS.receivableUsd]}
          sign={1}
          partyLabel="Pelanggan"
          fileName="Umur_piutang"
        />
      </TabsContent>
      <TabsContent value="sales" className="flex flex-col gap-4">
        <SalesList />
      </TabsContent>
    </Tabs>
  )
}

type Row = { id: string; customer: string; product: string; rolls: number; dpp: number; ppn: number; total: number; isTotal?: boolean }

/** Sales by customer and product for a month: rolls, DPP, PPN (by share of DPP) and total. */
function SalesList() {
  const { month, setMonth, where, skip } = useMonth()
  const invoices = useCollection<SalesInvoice>(SALES_INVOICES, { where, skip })
  const rows = new Map<string, Row>()
  for (const inv of invoices.data) {
    for (const l of inv.lines) {
      const key = `${inv.customerName}|${l.description}`
      const share = inv.dpp ? l.amount / inv.dpp : 0
      const r = rows.get(key) ?? { id: key, customer: inv.customerName, product: l.description, rolls: 0, dpp: 0, ppn: 0, total: 0 }
      r.rolls += l.qty
      r.dpp = round2(r.dpp + l.amount)
      r.ppn = round2(r.ppn + inv.ppn * share)
      r.total = round2(r.dpp + r.ppn)
      rows.set(key, r)
    }
  }
  const list = [...rows.values()].sort((a, b) => a.customer.localeCompare(b.customer) || a.product.localeCompare(b.product))
  const sum = (k: "rolls" | "dpp" | "ppn" | "total") => round2(list.reduce((s, r) => s + r[k], 0))
  const data = [...list, { id: "total", customer: "Total", product: "", rolls: sum("rolls"), dpp: sum("dpp"), ppn: sum("ppn"), total: sum("total"), isTotal: true }]

  return (
    <>
      <div className="flex items-center gap-2">
        <MonthPicker month={month} setMonth={setMonth} />
        <Button
          variant="outline"
          className="ml-auto"
          disabled={invoices.loading}
          onClick={() =>
            downloadExcel(`Daftar_penjualan_${month}.xlsx`, `Penjualan ${month}`, ["Pelanggan", "Produk", "Roll", "DPP", "PPN", "Total"], data.map((r) => [r.customer, r.product || null, r.rolls, r.dpp, r.ppn, r.total]), [30, 34, 8, 16, 16, 16])
          }
        >
          <FileDownIcon />
          Ekspor Excel
        </Button>
      </div>
      <DataTable
        columns={[
          { header: "Pelanggan", cell: (r) => r.customer },
          { header: "Produk", cell: (r) => <span className="whitespace-normal">{r.product}</span> },
          { header: "Roll", cell: (r) => formatNumber(r.rolls), className: "text-right tabular-nums" },
          { header: "DPP", cell: (r) => formatNumber(r.dpp), className: "text-right tabular-nums" },
          { header: "PPN", cell: (r) => formatNumber(r.ppn), className: "text-right tabular-nums" },
          { header: "Total", cell: (r) => formatNumber(r.total), className: "text-right font-medium tabular-nums" },
        ]}
        {...invoices}
        data={data}
        rowClassName={(r) => (r.isTotal ? "bg-muted/50 font-semibold" : undefined)}
        empty="Belum ada penjualan di bulan ini."
      />
    </>
  )
}
