"use client"

import { useState } from "react"
import { toast } from "sonner"
import { MoreHorizontalIcon, PlusIcon, Trash2Icon } from "lucide-react"

import { DataTable, type Column } from "@/components/data-table"
import { FilterSelect } from "@/components/filter-select"
import { JournalDialog } from "@/components/journal-view"
import { MonthPicker, useMonth } from "@/components/month-picker"
import { NumberInput } from "@/components/number-input"
import { ReasonDialog } from "@/components/reason-dialog"
import { SimpleSelect } from "@/components/simple-select"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useCollection } from "@/hooks/use-collection"
import { useCompany } from "@/hooks/use-company"
import {
  ACCOUNTS,
  CUSTOMERS,
  DELIVERIES,
  JOURNALS,
  PAYMENT_METHODS,
  PRODUCTS,
  RECEIVING_ACCOUNTS,
  SALES_INVOICES,
  SALES_STATUS,
  type Account,
  type Customer,
  type Delivery,
  type Journal,
  type PaymentMethod,
  type Product,
  type ReceivingAccount,
  type SalesInvoice,
  type SalesLine,
} from "@/lib/collections"
import { fgStockErrors, printName, shipmentOf } from "@/lib/deliveries"
import { documentFile, invoiceLayout } from "@/lib/documents"
import { round2 } from "@/lib/journal"
import { downloadLayout } from "@/lib/print-layout"
import { addDays } from "@/lib/purchase"
import { cancelSalesInvoice, productLabel, salesTotals, saveSalesInvoice } from "@/lib/sales"
import { formatDay, formatNumber, today } from "@/lib/utils"

const statusVariant = { open: "outline", partial: "secondary", paid: "default", cancelled: "secondary" } as const
const blankLine = (): SalesLine => ({ product: "", description: "", qty: 1, unit: "ROLL", price: 0, amount: 0 })

export default function SalesInvoicesPage() {
  const accounts = useCollection<Account>(ACCOUNTS).data
  const customers = useCollection<Customer>(CUSTOMERS).data
  const products = useCollection<Product>(PRODUCTS).data
  const { company } = useCompany()
  const { month, setMonth, where, skip } = useMonth()
  const invoices = useCollection<SalesInvoice>(SALES_INVOICES, { where, skip })
  const journals = useCollection<Journal>(JOURNALS, { where, skip }).data
  const [customer, setCustomer] = useState("")
  const [status, setStatus] = useState("")
  const [creating, setCreating] = useState(false)
  const [open, setOpen] = useState<Journal | null>(null)
  const [cancelling, setCancelling] = useState<SalesInvoice | null>(null)

  const layout = (i: SalesInvoice) => invoiceLayout(i, company, customers.find((c) => c.code === i.customer), products)
  const shown = invoices.data
    .filter((i) => (!customer || i.customer === customer) && (!status || i.status === status))
    .sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number, undefined, { numeric: true }))

  const columns: Column<SalesInvoice>[] = [
    {
      header: "No.",
      cell: (i) => (
        <button type="button" className="font-medium underline-offset-4 hover:underline" onClick={() => setOpen(journals.find((j) => j.id === i.journalId) ?? null)} title="Buka jurnal">
          {i.number}
        </button>
      ),
    },
    { header: "Tanggal", cell: (i) => formatDay(i.date) },
    { header: "Pelanggan", cell: (i) => <span className="whitespace-normal">{i.customerName}</span> },
    { header: "Surat jalan", cell: (i) => <span className="whitespace-normal">{i.deliveryNumbers?.join(", ") || "—"}</span>, className: "hidden lg:table-cell" },
    { header: "Faktur pajak", cell: (i) => i.taxInvoiceNo || "—", className: "hidden xl:table-cell" },
    { header: "DPP", cell: (i) => formatNumber(i.dpp), className: "text-right tabular-nums hidden md:table-cell" },
    { header: "PPN", cell: (i) => formatNumber(i.ppn), className: "text-right tabular-nums hidden lg:table-cell" },
    { header: "Total", cell: (i) => formatNumber(i.total), className: "text-right tabular-nums" },
    { header: "Sisa", cell: (i) => formatNumber(i.remaining), className: "text-right font-medium tabular-nums" },
    { header: "Jatuh tempo", cell: (i) => formatDay(i.dueDate), className: "hidden md:table-cell" },
    {
      header: "Status",
      cell: (i) => (
        <Badge variant={statusVariant[i.status]} title={i.cancelReason || undefined}>
          {SALES_STATUS[i.status]}
        </Badge>
      ),
    },
    {
      header: "",
      className: "w-12",
      cell: (i) => (
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Aksi untuk ${i.number}`} />}>
            <MoreHorizontalIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => window.open(`/sales-invoices/${i.id}/print`, "_blank")}>Cetak PDF</DropdownMenuItem>
            <DropdownMenuItem onClick={() => downloadLayout(documentFile("Faktur", i.number), layout(i)).catch((err) => toast.error(err.message))}>Unduh Excel</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setOpen(journals.find((j) => j.id === i.journalId) ?? null)}>Lihat jurnal</DropdownMenuItem>
            {i.status === "open" && (
              <DropdownMenuItem variant="destructive" onClick={() => setCancelling(i)}>
                Batalkan faktur
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
        <FilterSelect id="filter-status" value={status} onChange={setStatus} rows={Object.entries(SALES_STATUS).map(([code, name]) => ({ code, name }))} allLabel="Semua status" />
        <Button className="ml-auto" onClick={() => setCreating(true)}>
          <PlusIcon />
          Faktur baru
        </Button>
      </div>
      <DataTable columns={columns} {...invoices} data={shown} empty="Belum ada faktur penjualan di bulan ini." />
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="sm:max-w-5xl">{creating && <SalesForm customers={customers} products={products} onDone={() => setCreating(false)} />}</DialogContent>
      </Dialog>
      <JournalDialog journal={open} accounts={accounts} onClose={() => setOpen(null)} />
      <ReasonDialog
        title={cancelling && `Batalkan faktur ${cancelling.number}?`}
        description="Jurnalnya dibalik dan surat jalannya kembali menjadi Belum difakturkan."
        confirmLabel="Batalkan faktur"
        onConfirm={async (reason) => {
          const number = await cancelSalesInvoice(cancelling!.id, reason)
          toast.success(`Faktur ${number} dibatalkan.`)
        }}
        onClose={() => setCancelling(null)}
      />
    </>
  )
}

type Mode = "deliveries" | "direct"

function SalesForm({ customers, products, onDone }: { customers: Customer[]; products: Product[]; onDone: () => void }) {
  const [mode, setMode] = useState<Mode>("deliveries")
  const [customer, setCustomer] = useState("")
  const [date, setDate] = useState(today)
  const [taxInvoiceNo, setTaxInvoiceNo] = useState("")
  const [dueOverride, setDueDate] = useState("")
  // Dari surat jalan: ticked delivery notes and a price per line ("{delivery id}:{line}").
  const [picked, setPicked] = useState<string[]>([])
  const [prices, setPrices] = useState<Record<string, number | null>>({})
  // Faktur langsung: free lines and the delivery note made with them.
  const [lines, setLines] = useState<SalesLine[]>([blankLine()])
  const [ship, setShip] = useState({ ...shipmentOf(), plate: "", container: "", driver: "", driverPhone: "" })
  const [vatPct, setVatPct] = useState<number | null>(11)
  const [dppOverride, setDppRounded] = useState<number | null>(null)
  const [ppnOverride, setPpnEfaktur] = useState<number | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash")
  // null = not chosen yet → the first active account; "" = none.
  const [bankPick, setBankAccount] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // Open balance of this customer, for the credit-limit warning; and their delivery notes.
  const theirs = useCollection<SalesInvoice>(SALES_INVOICES, { where: [["customer", "==", customer]], skip: !customer }).data
  const deliveries = useCollection<Delivery>(DELIVERIES, { where: [["customer", "==", customer]], skip: !customer })
  const receiving = useCollection<ReceivingAccount>(RECEIVING_ACCOUNTS).data.filter((a) => a.active)

  const chosen = customers.find((c) => c.code === customer)
  const bankAccount = bankPick ?? receiving[0]?.code ?? ""
  const notInvoiced = deliveries.data.filter((d) => d.status === "open").sort((a, b) => a.date.localeCompare(b.date) || a.number.localeCompare(b.number))
  const priceOf = (d: Delivery, i: number) => prices[`${d.id}:${i}`] ?? products.find((p) => p.code === d.lines[i].product)?.price ?? null
  const fromDeliveries: SalesLine[] = notInvoiced
    .filter((d) => picked.includes(d.id))
    .flatMap((d) =>
      d.lines.map((l, i) => {
        const price = priceOf(d, i) ?? 0
        return { product: l.product, description: l.description, qty: l.qty, unit: l.unit, price, amount: round2(l.qty * price), delivery: d.number }
      })
    )
  const effective = mode === "deliveries" ? fromDeliveries : lines
  const dueDate = dueOverride || (date ? addDays(date, chosen?.paymentDays ?? 30) : "")
  const totals = salesTotals(effective, vatPct ?? 0)
  const dppRounded = dppOverride ?? totals.dppRounded
  const ppnEfaktur = ppnOverride ?? totals.ppnEfaktur
  const openBalance = round2(theirs.reduce((s, i) => s + i.remaining, 0))
  const overLimit = chosen?.creditLimit != null && openBalance + totals.total > chosen.creditLimit
  const stockProblems = mode === "direct" ? fgStockErrors(lines, products) : []

  const pickCustomer = (code: string) => {
    setCustomer(code)
    setPicked([])
    setPrices({})
    setShip((s) => ({ ...s, ...shipmentOf(customers.find((c) => c.code === code)) }))
  }
  const update = (i: number, patch: Partial<SalesLine>) =>
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch, amount: round2(((patch.qty ?? l.qty) || 0) * ((patch.price ?? l.price) || 0)) } : l)))
  const pickProduct = (i: number, code: string) => {
    const p = products.find((x) => x.code === code)
    update(i, p ? { product: code, description: printName(p), unit: (p.unit || "ROLL").toUpperCase(), price: p.price ?? 0 } : { product: "" })
  }

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!chosen) return setError("Pilih pelanggan.")
    if (overLimit && !confirm(`Saldo terbuka ${chosen.name} akan menjadi ${formatNumber(openBalance + totals.total)}, melebihi batas kredit ${formatNumber(chosen.creditLimit)}. Tetap simpan?`)) return
    const account = receiving.find((a) => a.code === bankAccount)
    const header = {
      customer,
      customerName: chosen.name,
      date,
      taxInvoiceNo: taxInvoiceNo.trim(),
      dueDate,
      vatPct: vatPct ?? 0,
      dppRounded,
      ppnEfaktur,
      paymentMethod,
      bankAccount: account ? { code: account.code, bank: account.bank, accountNo: account.accountNo, holder: account.holder, branch: account.branch } : null,
    }
    setError(null)
    setSaving(true)
    try {
      const number = await saveSalesInvoice(
        mode === "deliveries"
          ? { ...header, mode, deliveries: notInvoiced.filter((d) => picked.includes(d.id)).map((d) => ({ id: d.id, prices: d.lines.map((_, i) => priceOf(d, i) ?? 0) })) }
          : { ...header, mode, lines, shipment: Object.fromEntries(Object.entries(ship).map(([k, v]) => [k, v.trim()])) as typeof ship }
      )
      toast.success(`Faktur penjualan ${number} disimpan.`)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit}>
      <DialogHeader>
        <DialogTitle>Faktur penjualan</DialogTitle>
      </DialogHeader>
      <FieldGroup className="my-6">
        <div className="flex w-fit rounded-lg border p-0.5">
          {(
            [
              ["deliveries", "Dari surat jalan"],
              ["direct", "Faktur langsung"],
            ] as const
          ).map(([value, label]) => (
            <Button key={value} type="button" size="sm" variant={mode === value ? "secondary" : "ghost"} onClick={() => setMode(value)}>
              {label}
            </Button>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-4">
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="customer">Pelanggan</FieldLabel>
            <SimpleSelect id="customer" value={customer} onChange={pickCustomer} options={customers.filter((c) => c.active).map((c) => ({ value: c.code, label: `${c.code} · ${c.name}` }))} required />
          </Field>
          <Field>
            <FieldLabel htmlFor="date">Tanggal</FieldLabel>
            <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </Field>
          <Field>
            <FieldLabel htmlFor="dueDate">Jatuh tempo</FieldLabel>
            <Input id="dueDate" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />
          </Field>
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="taxInvoiceNo">No. faktur pajak</FieldLabel>
            <Input id="taxInvoiceNo" value={taxInvoiceNo} onChange={(e) => setTaxInvoiceNo(e.target.value)} />
          </Field>
        </div>
        {chosen && (
          <p className={`-mt-2 text-sm ${overLimit ? "text-amber-600" : "text-muted-foreground"}`}>
            Saldo terbuka {formatNumber(openBalance)}
            {chosen.creditLimit != null && ` · batas kredit ${formatNumber(chosen.creditLimit)}`}
            {overLimit && " — ⚠ faktur ini melebihi batas kredit"}
          </p>
        )}

        {mode === "deliveries" ? (
          <FieldSet>
            <FieldLegend variant="label">Surat jalan belum difakturkan</FieldLegend>
            {!customer ? (
              <FieldDescription>Pilih pelanggan untuk melihat surat jalannya.</FieldDescription>
            ) : !deliveries.loading && !notInvoiced.length ? (
              <FieldDescription>Tidak ada surat jalan yang belum difakturkan untuk pelanggan ini.</FieldDescription>
            ) : (
              <div className="flex flex-col gap-2">
                {notInvoiced.map((d) => {
                  const on = picked.includes(d.id)
                  return (
                    <div key={d.id} className="rounded-lg border p-3">
                      <label className="flex cursor-pointer items-center gap-3 text-sm">
                        <Checkbox checked={on} onCheckedChange={(v) => setPicked((ps) => (v ? [...ps, d.id] : ps.filter((p) => p !== d.id)))} />
                        <span className="font-medium">{d.number}</span>
                        <span className="text-muted-foreground">
                          {formatDay(d.date)} · {d.destination} · {formatNumber(d.totalQty)} roll
                        </span>
                      </label>
                      {on && (
                        <div className="mt-3 flex flex-col gap-2">
                          {d.lines.map((l, i) => (
                            <div key={i} className="grid items-center gap-2 text-sm sm:grid-cols-12">
                              <span className="sm:col-span-6">{l.description}</span>
                              <span className="tabular-nums sm:col-span-2">
                                {formatNumber(l.qty)} {l.unit}
                              </span>
                              <NumberInput
                                className="sm:col-span-2"
                                placeholder="Harga satuan"
                                aria-label={`Harga ${l.description}`}
                                value={priceOf(d, i)}
                                onChange={(price) => setPrices((ps) => ({ ...ps, [`${d.id}:${i}`]: price }))}
                                required
                              />
                              <span className="text-right font-medium tabular-nums sm:col-span-2">Rp {formatNumber(round2(l.qty * (priceOf(d, i) ?? 0)))}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </FieldSet>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              {lines.map((line, i) => (
                <div key={i} className="grid items-center gap-2 rounded-lg border p-3 sm:grid-cols-12">
                  <div className="sm:col-span-5">
                    <SimpleSelect
                      id={`product-${i}`}
                      value={line.product || "*"}
                      onChange={(v) => pickProduct(i, v === "*" ? "" : v)}
                      options={[{ value: "*", label: "Teks bebas" }, ...products.filter((p) => p.active).map((p) => ({ value: p.code, label: `${p.code} · ${productLabel(p)}` }))]}
                    />
                  </div>
                  <Input className="sm:col-span-7" placeholder="Keterangan" value={line.description} onChange={(e) => update(i, { description: e.target.value })} />
                  <NumberInput className="sm:col-span-2" placeholder="Jumlah" value={line.qty || null} onChange={(qty) => update(i, { qty: qty ?? 0 })} step={1} />
                  <Input className="sm:col-span-1" aria-label="Satuan" value={line.unit} onChange={(e) => update(i, { unit: e.target.value.toUpperCase() })} />
                  <NumberInput className="sm:col-span-3" placeholder="Harga satuan" value={line.price || null} onChange={(price) => update(i, { price: price ?? 0 })} />
                  <div className="text-right text-sm font-medium tabular-nums sm:col-span-5">Rp {formatNumber(line.amount)}</div>
                  <div className="flex justify-end sm:col-span-1">
                    {lines.length > 1 && (
                      <Button type="button" size="icon-sm" variant="ghost" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} aria-label="Hapus baris" title="Hapus baris">
                        <Trash2Icon />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => setLines((ls) => [...ls, blankLine()])}>
                <PlusIcon />
                Tambah baris
              </Button>
            </div>
            <FieldSet>
              <FieldLegend variant="label">Surat jalan otomatis</FieldLegend>
              <FieldDescription>Baris produk dibuatkan surat jalan dengan tanggal yang sama; stok barang jadi berkurang di surat jalan itu.</FieldDescription>
              <div className="grid gap-4 sm:grid-cols-4">
                <Field>
                  <FieldLabel htmlFor="destination">Dikirim ke (kota)</FieldLabel>
                  <Input id="destination" value={ship.destination} onChange={(e) => setShip({ ...ship, destination: e.target.value })} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="recipientName">Nama penerima</FieldLabel>
                  <Input id="recipientName" value={ship.recipientName} onChange={(e) => setShip({ ...ship, recipientName: e.target.value })} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="plate">No. polisi</FieldLabel>
                  <Input id="plate" value={ship.plate} onChange={(e) => setShip({ ...ship, plate: e.target.value.toUpperCase() })} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="driver">Nama sopir</FieldLabel>
                  <Input id="driver" value={ship.driver} onChange={(e) => setShip({ ...ship, driver: e.target.value })} />
                </Field>
              </div>
            </FieldSet>
          </>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <Field>
            <FieldLabel htmlFor="vatPct">PPN %</FieldLabel>
            <NumberInput id="vatPct" value={vatPct} onChange={setVatPct} />
          </Field>
          <Field>
            <FieldLabel htmlFor="dppRounded">DPP pembulatan</FieldLabel>
            <NumberInput id="dppRounded" value={dppRounded} onChange={setDppRounded} />
          </Field>
          <Field>
            <FieldLabel htmlFor="ppnEfaktur">PPN e-Faktur</FieldLabel>
            <NumberInput id="ppnEfaktur" value={ppnEfaktur} onChange={setPpnEfaktur} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field>
            <FieldLabel htmlFor="paymentMethod">Metode pembayaran</FieldLabel>
            <SimpleSelect id="paymentMethod" value={paymentMethod} onChange={(v) => setPaymentMethod(v as PaymentMethod)} options={Object.entries(PAYMENT_METHODS).map(([value, label]) => ({ value, label }))} required />
          </Field>
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="bankAccount">Rekening penerima</FieldLabel>
            <SimpleSelect
              id="bankAccount"
              value={bankAccount || "*"}
              onChange={(v) => setBankAccount(v === "*" ? "" : v)}
              options={[{ value: "*", label: "Tanpa rekening" }, ...receiving.map((a) => ({ value: a.code, label: `${a.bank} ${a.accountNo} · ${a.holder}` }))]}
            />
            <FieldDescription>Daftar rekening diatur di Pengaturan.</FieldDescription>
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-4 rounded-lg bg-muted/50 p-3 text-sm">
          {[
            ["DPP", totals.dpp],
            ["PPN", totals.ppn],
            ["Total", totals.total],
          ].map(([label, value]) => (
            <div key={label}>
              <div className="text-muted-foreground">{label}</div>
              <div className="font-semibold tabular-nums">{formatNumber(value as number)}</div>
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
        <Button type="submit" disabled={saving || !totals.dpp || stockProblems.length > 0}>
          {saving ? "Menyimpan…" : "Simpan & buat jurnal"}
        </Button>
      </DialogFooter>
    </form>
  )
}
