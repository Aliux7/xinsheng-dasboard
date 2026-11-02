"use client"

import { useState } from "react"
import { toast } from "sonner"
import { FileSpreadsheetIcon, MoreHorizontalIcon, PlusIcon, PrinterIcon, Trash2Icon } from "lucide-react"

import { DataTable, type Column } from "@/components/data-table"
import { FilterSelect } from "@/components/filter-select"
import { MonthPicker, useMonth } from "@/components/month-picker"
import { NumberInput } from "@/components/number-input"
import { ReasonDialog } from "@/components/reason-dialog"
import { SimpleSelect } from "@/components/simple-select"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Field, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useCollection } from "@/hooks/use-collection"
import { useCompany } from "@/hooks/use-company"
import { useToday } from "@/hooks/use-today"
import { daysBetween } from "@/lib/aging"
import { CUSTOMERS, DELIVERIES, DELIVERY_STATUS, PRODUCTS, type Customer, type Delivery, type Product } from "@/lib/collections"
import { deliveryLayout, documentFile } from "@/lib/documents"
import { cancelDelivery, deliveryTotals, fgStockErrors, lineWeights, saveDelivery, shipmentOf, type LineInput } from "@/lib/deliveries"
import { downloadLayout } from "@/lib/print-layout"
import { productLabel } from "@/lib/sales"
import { formatDay, formatNumber, today } from "@/lib/utils"

const statusVariant = { open: "outline", invoiced: "default", cancelled: "secondary" } as const
const statusRows = Object.entries(DELIVERY_STATUS).map(([code, name]) => ({ code, name }))

/** "Cetak PDF" opens the print page in a new tab; "Unduh Excel" writes the same delivery note as .xlsx. */
function useDeliveryPrint(customers: Customer[], products: Product[]) {
  const { company } = useCompany()
  return {
    print: (d: Delivery) => window.open(`/deliveries/${d.id}/print`, "_blank"),
    download: (d: Delivery) =>
      downloadLayout(documentFile("Surat_jalan", d.number), deliveryLayout(d, company, customers.find((c) => c.code === d.customer), products)).catch((err) => toast.error(err.message)),
  }
}

export default function DeliveriesPage() {
  const customers = useCollection<Customer>(CUSTOMERS).data
  const products = useCollection<Product>(PRODUCTS).data
  const printer = useDeliveryPrint(customers, products)
  return (
    <Tabs defaultValue="list" className="gap-4">
      <TabsList>
        <TabsTrigger value="list">Surat jalan</TabsTrigger>
        <TabsTrigger value="open">Belum difakturkan</TabsTrigger>
      </TabsList>
      <TabsContent value="list" className="flex flex-col gap-4">
        <DeliveryList customers={customers} products={products} printer={printer} />
      </TabsContent>
      <TabsContent value="open" className="flex flex-col gap-4">
        <NotInvoiced customers={customers} />
      </TabsContent>
    </Tabs>
  )
}

type Printer = ReturnType<typeof useDeliveryPrint>

function DeliveryList({ customers, products, printer }: { customers: Customer[]; products: Product[]; printer: Printer }) {
  const { month, setMonth, where, skip } = useMonth()
  const deliveries = useCollection<Delivery>(DELIVERIES, { where, skip })
  const [customer, setCustomer] = useState("")
  const [status, setStatus] = useState("")
  const [creating, setCreating] = useState(false)
  const [viewing, setViewing] = useState<Delivery | null>(null)
  const [cancelling, setCancelling] = useState<Delivery | null>(null)

  const shown = deliveries.data
    .filter((d) => (!customer || d.customer === customer) && (!status || d.status === status))
    .sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number))

  const columns: Column<Delivery>[] = [
    {
      header: "No.",
      cell: (d) => (
        <button type="button" className="font-medium underline-offset-4 hover:underline" onClick={() => setViewing(d)}>
          {d.number}
        </button>
      ),
    },
    { header: "Tanggal", cell: (d) => formatDay(d.date) },
    { header: "Pelanggan", cell: (d) => <span className="whitespace-normal">{d.customerName}</span> },
    { header: "Tujuan", cell: (d) => d.destination || "—", className: "hidden md:table-cell" },
    { header: "No. polisi", cell: (d) => d.plate || "—", className: "hidden md:table-cell" },
    { header: "Roll", cell: (d) => formatNumber(d.totalQty), className: "text-right tabular-nums" },
    {
      header: "Status",
      cell: (d) => (
        <Badge variant={statusVariant[d.status]} title={d.cancelReason || d.invoiceNumber || undefined}>
          {DELIVERY_STATUS[d.status]}
        </Badge>
      ),
    },
    {
      header: "",
      className: "w-12",
      cell: (d) => (
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Aksi untuk ${d.number}`} />}>
            <MoreHorizontalIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setViewing(d)}>Lihat</DropdownMenuItem>
            <DropdownMenuItem onClick={() => printer.print(d)}>Cetak PDF</DropdownMenuItem>
            <DropdownMenuItem onClick={() => printer.download(d)}>Unduh Excel</DropdownMenuItem>
            {d.status === "open" && (
              <DropdownMenuItem variant="destructive" onClick={() => setCancelling(d)}>
                Batalkan
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <MonthPicker month={month} setMonth={setMonth} />
        <FilterSelect id="filter-customer" value={customer} onChange={setCustomer} rows={customers} allLabel="Semua pelanggan" />
        <FilterSelect id="filter-status" value={status} onChange={setStatus} rows={statusRows} allLabel="Semua status" />
        <Button className="ml-auto" onClick={() => setCreating(true)}>
          <PlusIcon />
          Surat jalan baru
        </Button>
      </div>
      <DataTable columns={columns} {...deliveries} data={shown} empty="Belum ada surat jalan di bulan ini." />
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="sm:max-w-5xl">{creating && <DeliveryForm customers={customers} products={products} onDone={() => setCreating(false)} />}</DialogContent>
      </Dialog>
      <Dialog open={viewing !== null} onOpenChange={(open) => !open && setViewing(null)}>
        <DialogContent className="sm:max-w-4xl">
          {viewing && (
            <DeliveryDetail
              delivery={viewing}
              printer={printer}
              onCancel={() => {
                setCancelling(viewing)
                setViewing(null)
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      <ReasonDialog
        title={cancelling && `Batalkan ${cancelling.number}?`}
        description={`${cancelling ? formatNumber(cancelling.totalQty) : ""} roll kembali ke stok barang jadi.`}
        confirmLabel="Batalkan surat jalan"
        onConfirm={async (reason) => {
          const number = await cancelDelivery(cancelling!.id, reason)
          toast.success(`Surat jalan ${number} dibatalkan; stok barang jadi dikembalikan.`)
        }}
        onClose={() => setCancelling(null)}
      />
    </>
  )
}

const kg = (n: number | null | undefined) => (n == null ? "—" : formatNumber(n))

function DeliveryDetail({ delivery: d, printer, onCancel }: { delivery: Delivery; printer: Printer; onCancel: () => void }) {
  const weighed = d.totalScale != null
  const info: [string, string][] = [
    ["Tanggal", formatDay(d.date)],
    ["Pelanggan", d.customerName],
    ["Dikirim ke", d.destination],
    ["Penerima", [d.recipientName, d.recipientAddress, d.recipientPhone].filter(Boolean).join(" · ")],
    ["No. polisi", d.plate],
    ["No. kontainer", d.container],
    ["Sopir", [d.driver, d.driverPhone].filter(Boolean).join(" · ")],
    ["Status", `${DELIVERY_STATUS[d.status]}${d.invoiceNumber ? ` (${d.invoiceNumber})` : ""}${d.cancelReason ? `: ${d.cancelReason}` : ""}`],
  ]
  return (
    <>
      <DialogHeader>
        <DialogTitle>Surat jalan {d.number}</DialogTitle>
      </DialogHeader>
      <dl className="my-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        {info
          .filter(([, value]) => value)
          .map(([label, value]) => (
            <div key={label} className="flex gap-2">
              <dt className="w-28 shrink-0 text-muted-foreground">{label}</dt>
              <dd className="whitespace-pre-line">{value}</dd>
            </div>
          ))}
      </dl>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:font-medium">
              <th className="text-left">Produk</th>
              <th className="text-left">唛头</th>
              <th className="text-right">Jumlah</th>
              <th className="text-right">Bersih kg</th>
              <th className="text-right">Bruto kg</th>
              {weighed && (
                <>
                  <th className="text-right">Timbangan kg</th>
                  <th className="text-right">Rata-rata/roll</th>
                  <th className="text-right">Lebih kg</th>
                </>
              )}
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {d.lines.map((l, i) => {
              const w = lineWeights(l, l.rollNetKg, l.rollGrossKg)
              return (
                <tr key={i} className="border-t [&>td]:px-3 [&>td]:py-2">
                  <td>{l.description}</td>
                  <td>{l.sticker || "—"}</td>
                  <td className="text-right">
                    {formatNumber(l.qty)} {l.unit}
                  </td>
                  <td className="text-right">{kg(l.netKg)}</td>
                  <td className="text-right">{kg(l.grossKg)}</td>
                  {weighed && (
                    <>
                      <td className="text-right">{kg(l.scaleKg)}</td>
                      <td className="text-right">{kg(w.averageKg)}</td>
                      <td className="text-right">{w.overKg == null ? "—" : `${formatNumber(w.overKg)} (${formatNumber(Math.round((w.overPct ?? 0) * 10000) / 100)}%)`}</td>
                    </>
                  )}
                </tr>
              )
            })}
            <tr className="border-t bg-muted/50 font-semibold [&>td]:px-3 [&>td]:py-2">
              <td colSpan={2}>Total</td>
              <td className="text-right">{formatNumber(d.totalQty)}</td>
              <td className="text-right">{kg(d.totalNet)}</td>
              <td className="text-right">{kg(d.totalGross)}</td>
              {weighed && (
                <>
                  <td className="text-right">{kg(d.totalScale)}</td>
                  <td />
                  <td className="text-right">{kg(d.overweight)}</td>
                </>
              )}
            </tr>
          </tbody>
        </table>
      </div>
      <DialogFooter className="mt-4">
        {d.status === "open" && (
          <Button variant="outline" className="text-destructive sm:mr-auto" onClick={onCancel}>
            Batalkan
          </Button>
        )}
        <Button variant="outline" onClick={() => printer.download(d)}>
          <FileSpreadsheetIcon />
          Unduh Excel
        </Button>
        <Button onClick={() => printer.print(d)}>
          <PrinterIcon />
          Cetak PDF
        </Button>
      </DialogFooter>
    </>
  )
}

type FormLine = Omit<LineInput, "qty"> & { qty: number | null }
const blankLine = (): FormLine => ({ product: "", qty: null, unit: "ROLL", sticker: "", scaleKg: null })

function DeliveryForm({ customers, products, onDone }: { customers: Customer[]; products: Product[]; onDone: () => void }) {
  const [date, setDate] = useState(today)
  const [customer, setCustomer] = useState("")
  const [ship, setShip] = useState(shipmentOf())
  const [truck, setTruck] = useState({ plate: "", container: "", driver: "", driverPhone: "" })
  const [lines, setLines] = useState<FormLine[]>([blankLine()])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const chosen = customers.find((c) => c.code === customer)
  const productOf = (code: string) => products.find((p) => p.code === code)
  const computed = lines.map((l) => {
    const p = productOf(l.product)
    const rollNetKg = p?.netKg ?? 0
    return { ...l, qty: l.qty ?? 0, ...lineWeights({ qty: l.qty ?? 0, scaleKg: l.scaleKg }, rollNetKg, p?.grossKg ?? rollNetKg) }
  })
  const totals = deliveryTotals(computed)
  const stockProblems = fgStockErrors(computed, products)
  const update = (i: number, patch: Partial<FormLine>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)))

  const pickCustomer = (code: string) => {
    setCustomer(code)
    setShip(shipmentOf(customers.find((c) => c.code === code)))
  }

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!chosen) return setError("Pilih pelanggan.")
    setError(null)
    setSaving(true)
    try {
      const trim = <T extends Record<string, string>>(o: T) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v.trim()])) as T
      const number = await saveDelivery({
        date,
        customer,
        customerName: chosen.name,
        ...trim(ship),
        ...trim(truck),
        lines: computed.map((l) => ({ product: l.product, qty: l.qty, unit: l.unit, sticker: l.sticker, scaleKg: l.scaleKg })),
      })
      toast.success(`Surat jalan ${number} disimpan.`)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit}>
      <DialogHeader>
        <DialogTitle>Surat jalan baru</DialogTitle>
      </DialogHeader>
      <FieldGroup className="my-6">
        <div className="grid gap-4 sm:grid-cols-4">
          <Field>
            <FieldLabel htmlFor="date">Tanggal</FieldLabel>
            <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </Field>
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="customer">Pelanggan</FieldLabel>
            <SimpleSelect id="customer" value={customer} onChange={pickCustomer} options={customers.filter((c) => c.active).map((c) => ({ value: c.code, label: `${c.code} · ${c.name}` }))} required />
          </Field>
          <Field>
            <FieldLabel htmlFor="number">No. surat jalan</FieldLabel>
            <Input id="number" value="DO-… (otomatis)" disabled />
          </Field>
        </div>
        <FieldSet>
          <FieldLegend variant="label">Pengiriman</FieldLegend>
          <div className="grid gap-4 sm:grid-cols-4">
            <Field>
              <FieldLabel htmlFor="destination">Dikirim ke (kota)</FieldLabel>
              <Input id="destination" value={ship.destination} onChange={(e) => setShip({ ...ship, destination: e.target.value })} required />
            </Field>
            <Field>
              <FieldLabel htmlFor="recipientName">Nama penerima</FieldLabel>
              <Input id="recipientName" value={ship.recipientName} onChange={(e) => setShip({ ...ship, recipientName: e.target.value })} />
            </Field>
            <Field>
              <FieldLabel htmlFor="recipientAddress">Alamat penerima</FieldLabel>
              <Input id="recipientAddress" value={ship.recipientAddress} onChange={(e) => setShip({ ...ship, recipientAddress: e.target.value })} />
            </Field>
            <Field>
              <FieldLabel htmlFor="recipientPhone">Telp. penerima</FieldLabel>
              <Input id="recipientPhone" type="tel" value={ship.recipientPhone} onChange={(e) => setShip({ ...ship, recipientPhone: e.target.value })} />
            </Field>
          </div>
        </FieldSet>
        <FieldSet>
          <FieldLegend variant="label">Truk</FieldLegend>
          <div className="grid gap-4 sm:grid-cols-4">
            <Field>
              <FieldLabel htmlFor="plate">No. polisi</FieldLabel>
              <Input id="plate" value={truck.plate} onChange={(e) => setTruck({ ...truck, plate: e.target.value.toUpperCase() })} placeholder="W 8515 PU" required />
            </Field>
            <Field>
              <FieldLabel htmlFor="container">No. kontainer</FieldLabel>
              <Input id="container" value={truck.container} onChange={(e) => setTruck({ ...truck, container: e.target.value.toUpperCase() })} />
            </Field>
            <Field>
              <FieldLabel htmlFor="driver">Nama sopir</FieldLabel>
              <Input id="driver" value={truck.driver} onChange={(e) => setTruck({ ...truck, driver: e.target.value })} required />
            </Field>
            <Field>
              <FieldLabel htmlFor="driverPhone">Telp. sopir</FieldLabel>
              <Input id="driverPhone" type="tel" value={truck.driverPhone} onChange={(e) => setTruck({ ...truck, driverPhone: e.target.value })} />
            </Field>
          </div>
        </FieldSet>
        <div className="flex flex-col gap-2">
          {computed.map((line, i) => {
            const p = productOf(line.product)
            return (
              <div key={i} className="grid items-center gap-2 rounded-lg border p-3 sm:grid-cols-12">
                <div className="sm:col-span-5">
                  <SimpleSelect
                    id={`product-${i}`}
                    value={line.product}
                    onChange={(code) => update(i, { product: code, unit: (productOf(code)?.unit || "ROLL").toUpperCase() })}
                    options={products.filter((x) => x.active).map((x) => ({ value: x.code, label: `${x.code} · ${productLabel(x)}` }))}
                    placeholder="Pilih produk…"
                    required
                  />
                </div>
                <NumberInput className="sm:col-span-2" placeholder="Jumlah" aria-label="Jumlah" value={lines[i].qty} onChange={(qty) => update(i, { qty })} step={1} required />
                <Input className="sm:col-span-1" aria-label="Satuan" value={line.unit} onChange={(e) => update(i, { unit: e.target.value.toUpperCase() })} />
                <Input className="sm:col-span-2" placeholder="唛头 / stiker" aria-label="Stiker / merek" value={line.sticker} onChange={(e) => update(i, { sticker: e.target.value })} />
                <NumberInput className="sm:col-span-2" placeholder="地磅重 kg" aria-label="Berat timbangan kg" value={line.scaleKg} onChange={(scaleKg) => update(i, { scaleKg })} />
                <div className="text-xs text-muted-foreground tabular-nums sm:col-span-11">
                  {p ? (
                    <>
                      Stok {formatNumber(p.fgQty ?? 0)} roll · Bersih {formatNumber(line.netKg)} kg · Bruto {formatNumber(line.grossKg)} kg
                      {line.averageKg != null && ` · Rata-rata ${formatNumber(line.averageKg)} kg/roll · Lebih ${formatNumber(line.overKg)} kg (${formatNumber(Math.round((line.overPct ?? 0) * 10000) / 100)}%)`}
                    </>
                  ) : (
                    "Pilih produk untuk melihat stok dan berat."
                  )}
                </div>
                <div className="flex justify-end sm:col-span-1">
                  {lines.length > 1 && (
                    <Button type="button" size="icon-sm" variant="ghost" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} aria-label="Hapus baris" title="Hapus baris">
                      <Trash2Icon />
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
          <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => setLines((ls) => [...ls, blankLine()])}>
            <PlusIcon />
            Tambah baris
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-4 rounded-lg bg-muted/50 p-3 text-sm sm:grid-cols-5">
          {[
            ["Roll", totals.totalQty],
            ["Bersih (kg)", totals.totalNet],
            ["Bruto (kg)", totals.totalGross],
            ["Timbangan (kg)", totals.totalScale],
            ["Kelebihan (kg)", totals.overweight],
          ].map(([label, value]) => (
            <div key={label}>
              <div className="text-muted-foreground">{label}</div>
              <div className="font-semibold tabular-nums">{kg(value as number | null)}</div>
            </div>
          ))}
        </div>
        {stockProblems.map((p) => (
          <FieldError key={p}>{p}</FieldError>
        ))}
        {error && <FieldError>{error}</FieldError>}
      </FieldGroup>
      <DialogFooter>
        <DialogClose render={<Button variant="outline" type="button" />}>Batal</DialogClose>
        <Button type="submit" disabled={saving || stockProblems.length > 0 || !totals.totalQty}>
          {saving ? "Menyimpan…" : "Simpan surat jalan"}
        </Button>
      </DialogFooter>
    </form>
  )
}

type CustomerRow = { id: string; name: string; count: number; rolls: number; kg: number; oldest: number }

/** Delivery notes not invoiced yet, by customer with the oldest age (like Pencocokan timbangan). */
function NotInvoiced({ customers }: { customers: Customer[] }) {
  const today = useToday()
  const open = useCollection<Delivery>(DELIVERIES, { where: [["status", "==", "open"]] })
  const age = (d: Delivery) => (today ? daysBetween(d.date, today) : 0)
  const byCustomer: CustomerRow[] = [...new Set(open.data.map((d) => d.customer))]
    .map((code) => {
      const these = open.data.filter((d) => d.customer === code)
      return {
        id: code,
        name: customers.find((c) => c.code === code)?.name ?? these[0].customerName,
        count: these.length,
        rolls: these.reduce((s, d) => s + d.totalQty, 0),
        kg: Math.round(these.reduce((s, d) => s + d.totalGross, 0) * 1000) / 1000,
        oldest: Math.max(...these.map(age)),
      }
    })
    .sort((a, b) => b.oldest - a.oldest)

  const customerColumns: Column<CustomerRow>[] = [
    { header: "Pelanggan", cell: (r) => r.name },
    { header: "Surat jalan", cell: (r) => r.count, className: "text-right tabular-nums" },
    { header: "Roll", cell: (r) => formatNumber(r.rolls), className: "text-right tabular-nums" },
    { header: "Bruto kg", cell: (r) => formatNumber(r.kg), className: "text-right tabular-nums hidden md:table-cell" },
    { header: "Tertua (hari)", cell: (r) => <span className={r.oldest > 30 ? "font-medium text-amber-600" : undefined}>{r.oldest}</span>, className: "text-right tabular-nums" },
  ]
  const deliveryColumns: Column<Delivery>[] = [
    { header: "No.", cell: (d) => <span className="font-medium">{d.number}</span> },
    { header: "Tanggal", cell: (d) => formatDay(d.date) },
    { header: "Umur (hari)", cell: (d) => age(d), className: "text-right tabular-nums" },
    { header: "Pelanggan", cell: (d) => d.customerName },
    { header: "Tujuan", cell: (d) => d.destination || "—", className: "hidden md:table-cell" },
    { header: "Roll", cell: (d) => formatNumber(d.totalQty), className: "text-right tabular-nums" },
  ]

  return (
    <>
      <DataTable columns={customerColumns} {...open} data={byCustomer} empty="Semua surat jalan sudah difakturkan." />
      <DataTable columns={deliveryColumns} {...open} data={[...open.data].sort((a, b) => a.date.localeCompare(b.date))} empty="—" />
    </>
  )
}
