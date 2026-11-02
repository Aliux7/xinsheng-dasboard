"use client"

import Link from "next/link"
import { useState, type ReactNode } from "react"

import { AreaTrend } from "@/components/area-trend"
import { Bars, Donut } from "@/components/mini-charts"
import { useAuth } from "@/components/auth-provider"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useCollection } from "@/hooks/use-collection"
import { useToday } from "@/hooks/use-today"
import {
  ACCOUNTS,
  BANKS,
  CONDITIONS,
  DELIVERIES,
  JOURNALS,
  MATERIALS,
  PURCHASE_INVOICES,
  ROLLS,
  SALES_INVOICES,
  STOCK_COUNTS,
  STOCK_MOVEMENTS,
  SUPPLIER_PAYMENTS,
  type Account,
  type Condition,
  type Delivery,
  type Journal,
  type Material,
  type PurchaseInvoice,
  type Roll,
  type SalesInvoice,
  type StockMovement,
} from "@/lib/collections"
import { BUCKETS, bucketOf, daysBetween } from "@/lib/aging"
import { round2 } from "@/lib/journal"
import { addDays } from "@/lib/purchase"
import { previousMonth } from "@/lib/report"
import { profitAndLoss } from "@/lib/statements"
import { formatNumber, monthRange } from "@/lib/utils"

const compact = new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 })

const tradeSeries = { sales: "Penjualan", purchases: "Pembelian" }
const stockSeries = { received: "Masuk (kg)", used: "Pemakaian (kg)" }

const monthLabel = (m: string) => new Intl.DateTimeFormat("id-ID", { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(`${m}-01T00:00:00Z`))
const dayLabel = (d: string) => new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`))

/** The `count` months up to and including `month`, oldest first. */
function lastMonths(month: string, count: number) {
  const months = [month]
  while (months.length < count) months.unshift(previousMonth(months[0]))
  return months
}

/** Owner dashboard: one tile per area (each opens its page), then the trends. */
export default function DashboardPage() {
  const { user } = useAuth()
  const today = useToday() ?? ""
  const month = today.slice(0, 7)
  const [start, end] = month ? monthRange(month) : ["", ""]

  const materials = useCollection<Material>(MATERIALS).data.filter((m) => m.active)
  const rolls = useCollection<Roll>(ROLLS, { where: [["status", "==", "instock"]] }).data
  const payables = useCollection<PurchaseInvoice>(PURCHASE_INVOICES, { where: [["status", "in", ["open", "partial"]]] }).data
  const receivables = useCollection<SalesInvoice>(SALES_INVOICES, { where: [["status", "in", ["open", "partial"]]] }).data
  const salesMonth = useCollection<SalesInvoice>(SALES_INVOICES, { where: [["date", ">=", start], ["date", "<", end]], skip: !month }).data.filter((i) => i.status !== "cancelled")
  const deliveriesMonth = useCollection<Delivery>(DELIVERIES, { where: [["date", ">=", start], ["date", "<", end]], skip: !month }).data.filter((d) => d.status !== "cancelled")
  const notInvoiced = useCollection<Delivery>(DELIVERIES, { where: [["status", "==", "open"]] }).data
  const journalsMonth = useCollection<Journal>(JOURNALS, { where: [["date", ">=", start], ["date", "<", end]], skip: !month }).data
  const accounts = useCollection<Account>(ACCOUNTS).data
  const bank1 = useCollection<Journal>(JOURNALS, { where: [["accounts", "array-contains", BANKS[0].account]] }).data
  const bank2 = useCollection<Journal>(JOURNALS, { where: [["accounts", "array-contains", BANKS[1].account]] }).data
  const bank3 = useCollection<Journal>(JOURNALS, { where: [["accounts", "array-contains", BANKS[2].account]] }).data
  // Trends: 12 months of sales and purchases, 30 days of stock in/out.
  const months = month ? lastMonths(month, 12) : []
  const yearStart = months[0] ? `${months[0]}-01` : ""
  const daysStart = today ? addDays(today, -29) : ""
  const salesYear = useCollection<SalesInvoice>(SALES_INVOICES, { where: [["date", ">=", yearStart]], skip: !yearStart }).data.filter((i) => i.status !== "cancelled")
  const purchasesYear = useCollection<PurchaseInvoice>(PURCHASE_INVOICES, { where: [["date", ">=", yearStart]], skip: !yearStart }).data
  const movements = useCollection<StockMovement>(STOCK_MOVEMENTS, { where: [["date", ">=", daysStart]], skip: !daysStart }).data
  const [tradeRange, setTradeRange] = useState(6)
  const [stockRange, setStockRange] = useState(30)
  const countsWaiting = useCollection(STOCK_COUNTS, { where: [["status", "==", "pending"]] }).data.length
  const paymentsWaiting = useCollection(SUPPLIER_PAYMENTS, { where: [["status", "==", "pending"]] }).data.length
  const matchesWaiting = useCollection(PURCHASE_INVOICES, { where: [["matchStatus", "==", "pending"]] }).data.length

  const totalKg = round2(materials.reduce((s, m) => s + (m.stock ?? 0), 0))
  const lowStock = materials.filter((m) => m.minStock != null && (m.stock ?? 0) < m.minStock).length
  const grades = [...new Set(rolls.map((r) => r.grade))]
    .sort()
    .map((g) => ({ grade: g, count: rolls.filter((r) => r.grade === g).length, kg: round2(rolls.filter((r) => r.grade === g).reduce((s, r) => s + r.kg, 0)) }))
  const balanceOf = (journals: Journal[], account: string) =>
    round2(journals.reduce((s, j) => s + j.lines.filter((l) => l.account === account).reduce((t, l) => t + l.debit - l.credit, 0), 0))
  const banks = [bank1, bank2, bank3].map((js, i) => ({ ...BANKS[i], balance: balanceOf(js, BANKS[i].account) }))
  const dueSoon = payables.filter((i) => today && i.dueDate <= addDays(today, 7))
  const overdue = receivables.filter((i) => today && i.dueDate < today)
  const sales = round2(salesMonth.reduce((s, i) => s + i.dpp, 0))
  // Month-to-date profit = this month's P&L, same rules as Laba rugi.
  const pnl = month ? profitAndLoss(journalsMonth, accounts, Number(month.slice(0, 4))) : null
  const m = Number(month.slice(5, 7)) - 1
  const pick = (section: string) => round2((pnl?.lines ?? []).filter((l) => l.section === section).reduce((s, l) => s + l.values[m], 0))
  const profit = round2(pick("revenue") - pick("cost") - pick("selling") - pick("ga") + pick("other") - pick("unmapped"))
  const waiting = countsWaiting + paymentsWaiting + matchesWaiting
  const deliveriesToday = deliveriesMonth.filter((d) => d.date === today)
  const rollsOf = (rows: Delivery[]) => rows.reduce((s, d) => s + d.totalQty, 0)

  // Tile charts.
  const stockSlices = (Object.keys(CONDITIONS) as Condition[]).map((c) => ({
    key: c,
    label: CONDITIONS[c].split(" –")[0],
    value: round2(materials.filter((m) => m.condition === c).reduce((s, m) => s + (m.stock ?? 0), 0)),
  }))
  const gradeSlices = grades.map((g, i) => ({ key: `g${i}`, label: g.grade || "Tanpa grade", value: g.count }))
  const sumOpen = (rows: { remaining: number }[]) => round2(rows.reduce((s, i) => s + i.remaining, 0))
  const week = today ? addDays(today, 7) : ""
  const payableTotal = sumOpen(payables)
  const payableSlices = [
    { key: "overdue", label: "Lewat jatuh tempo", value: sumOpen(payables.filter((i) => i.dueDate < today)), warn: true },
    { key: "week", label: "≤ 7 hari", value: sumOpen(payables.filter((i) => i.dueDate >= today && i.dueDate <= week)) },
    { key: "later", label: "> 7 hari", value: sumOpen(payables.filter((i) => i.dueDate > week)) },
  ]
  const receivableTotal = sumOpen(receivables)
  const receivableSlices = BUCKETS.map(([key, label]) => ({
    key,
    label,
    value: sumOpen(receivables.filter((r) => today && bucketOf(daysBetween(r.dueDate || r.date, today)) === key)),
  }))
  const pnlSlices = [
    { key: "revenue", label: "Pendapatan", value: pick("revenue") },
    { key: "cost", label: "HPP", value: pick("cost") },
    { key: "expense", label: "Biaya", value: round2(pick("selling") + pick("ga") + pick("unmapped")) },
    { key: "other", label: "Lain-lain", value: pick("other") },
    { key: "profit", label: "Laba (rugi)", value: profit },
  ]
  const bankSlices = banks.map((b) => ({ key: b.id, label: b.name, value: b.balance }))

  const sumBy = (rows: { date: string; dpp: number }[], m: string) => round2(rows.filter((r) => r.date.startsWith(m)).reduce((s, r) => s + r.dpp, 0))
  const trade = months.slice(-tradeRange).map((m) => ({ label: monthLabel(m), sales: sumBy(salesYear, m), purchases: sumBy(purchasesYear, m) }))
  const days = daysStart ? Array.from({ length: stockRange }, (_, i) => addDays(today, i - stockRange + 1)) : []
  const stock = days.map((d) => {
    const these = movements.filter((m) => m.date === d)
    return {
      label: dayLabel(d),
      received: round2(these.filter((m) => m.kind === "receipt").reduce((s, m) => s + m.qty, 0)),
      used: round2(-these.filter((m) => m.kind === "usage").reduce((s, m) => s + m.qty, 0)),
    }
  })
  // All banks' total balance at the end of every month.
  const bankTrend = months.map((m) => {
    const end = `${m}-31`
    return {
      label: monthLabel(m),
      total: round2([bank1, bank2, bank3].reduce((s, js, i) => s + balanceOf(js.filter((j) => j.date <= end), BANKS[i].account), 0)),
    }
  })

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground">Selamat datang kembali, {user?.displayName || user?.email}.</p>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Tile href="/stock" title="Stok bahan baku" value={`${formatNumber(totalKg)} kg`}>
          <Donut slices={stockSlices} center={compact.format(totalKg)} centerLabel="kg" />
          <Note warn={lowStock > 0}>Di bawah minimum: {lowStock} bahan</Note>
        </Tile>
        <Tile href="/cloth-stock" title="Roll kain di stok" value={`${rolls.length} roll`}>
          <Donut slices={gradeSlices} center={String(rolls.length)} centerLabel="roll" />
          <Note>{formatNumber(round2(rolls.reduce((s, r) => s + r.kg, 0)))} kg</Note>
        </Tile>
        <Tile href="/payables-aging" title="Hutang jatuh tempo minggu ini" value={formatNumber(round2(dueSoon.reduce((s, i) => s + i.remaining, 0)))}>
          <Donut slices={payableSlices} center={compact.format(payableTotal)} centerLabel="total hutang" />
          <Note>
            {dueSoon.length} faktur sampai {today && addDays(today, 7)}
          </Note>
        </Tile>
        <Tile href="/receivables" title="Piutang lewat jatuh tempo" value={formatNumber(round2(overdue.reduce((s, i) => s + i.remaining, 0)))} warn={overdue.length > 0}>
          <Donut slices={receivableSlices} center={compact.format(receivableTotal)} centerLabel="total piutang" />
          <Note>{overdue.length} faktur lewat jatuh tempo</Note>
        </Tile>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Tile href="/profit-loss" title={`Penjualan & laba ${month}`} value={formatNumber(sales)}>
          <Bars slices={pnlSlices} />
          <Note warn={profit < 0}>Laba (rugi) bulan berjalan: {formatNumber(profit)}</Note>
        </Tile>
        <Tile href="/bank" title="Kas & bank" value={formatNumber(round2(banks.reduce((s, b) => s + b.balance, 0)))}>
          <Bars slices={bankSlices} />
        </Tile>
        <Tile href="/deliveries" title="Surat jalan hari ini" value={`${deliveriesToday.length} SJ`}>
          <div className="flex flex-col gap-1 text-sm">
            {(
              [
                ["Hari ini", deliveriesToday],
                ["Bulan ini", deliveriesMonth],
                ["Belum difakturkan", notInvoiced],
              ] as const
            ).map(([label, rows]) => (
              <Link key={label} href="/deliveries" className="flex justify-between rounded-md px-2 py-1.5 hover:bg-muted">
                <span>{label}</span>
                <span className={`font-semibold tabular-nums ${label === "Belum difakturkan" && rows.length ? "text-amber-600" : ""}`}>
                  {rows.length} SJ · {formatNumber(rollsOf([...rows]))} roll
                </span>
              </Link>
            ))}
          </div>
        </Tile>
        <Tile href="/stock-counts" title="Menunggu persetujuan" value={String(waiting)} warn={waiting > 0}>
          <div className="flex flex-col gap-1 text-sm">
            {[
              ["/stock-counts", "Stok opname", countsWaiting],
              ["/supplier-payments", "Pembayaran", paymentsWaiting],
              ["/matching", "Selisih timbangan", matchesWaiting],
            ].map(([href, label, n]) => (
              <Link key={href} href={String(href)} className="flex justify-between rounded-md px-2 py-1.5 hover:bg-muted">
                <span>{label}</span>
                <span className={`font-semibold tabular-nums ${n ? "text-amber-600" : "text-muted-foreground"}`}>{n}</span>
              </Link>
            ))}
          </div>
        </Tile>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Penjualan & pembelian</CardTitle>
          <CardDescription>DPP faktur per bulan, {tradeRange} bulan terakhir</CardDescription>
          <CardAction>
            <RangeToggle value={tradeRange} onChange={setTradeRange} options={[[3, "3 bln"], [6, "6 bln"], [12, "12 bln"]]} />
          </CardAction>
        </CardHeader>
        <CardContent>
          <AreaTrend data={trade} series={tradeSeries} />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Bahan baku masuk & pemakaian</CardTitle>
            <CardDescription>Kg per hari, {stockRange} hari terakhir</CardDescription>
            <CardAction>
              <RangeToggle value={stockRange} onChange={setStockRange} options={[[7, "7 hari"], [30, "30 hari"]]} />
            </CardAction>
          </CardHeader>
          <CardContent>
            <AreaTrend data={stock} series={stockSeries} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Saldo kas & bank</CardTitle>
            <CardDescription>Total saldo akhir bulan semua bank, 12 bulan terakhir</CardDescription>
          </CardHeader>
          <CardContent>
            <AreaTrend data={bankTrend} series={{ total: "Total kas & bank" }} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function RangeToggle({ value, onChange, options }: { value: number; onChange: (v: number) => void; options: [number, string][] }) {
  return (
    <div className="flex rounded-lg border p-0.5">
      {options.map(([v, label]) => (
        <Button key={v} type="button" size="sm" variant={v === value ? "secondary" : "ghost"} className="h-7 px-2.5" onClick={() => onChange(v)}>
          {label}
        </Button>
      ))}
    </div>
  )
}

function Tile({ href, title, value, warn, children }: { href: string; title: string; value: string; warn?: boolean; children?: ReactNode }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>
          <Link href={href} className="hover:underline">
            {title}
          </Link>
        </CardDescription>
        <CardTitle className={`text-2xl font-semibold tabular-nums ${warn ? "text-amber-600" : ""}`}>
          <Link href={href}>{value}</Link>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-between gap-2">{children}</CardContent>
    </Card>
  )
}

function Note({ warn, children }: { warn?: boolean; children: ReactNode }) {
  return <div className={`text-xs ${warn ? "text-destructive" : "text-muted-foreground"}`}>{children}</div>
}
