"use client"

import { useState } from "react"
import { toast } from "sonner"
import { PlusIcon, Trash2Icon } from "lucide-react"

import { DataTable, type Column } from "@/components/data-table"
import { FilterSelect } from "@/components/filter-select"
import { JournalDialog } from "@/components/journal-view"
import { MonthPicker, useMonth } from "@/components/month-picker"
import { NumberInput } from "@/components/number-input"
import { SimpleSelect } from "@/components/simple-select"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useCollection } from "@/hooks/use-collection"
import {
  ACCOUNTS,
  CUSTOMERS,
  INVOICE_STATUS,
  JOURNALS,
  PRODUCTS,
  SALES_INVOICES,
  type Account,
  type Customer,
  type Journal,
  type Product,
  type SalesInvoice,
  type SalesLine,
} from "@/lib/collections"
import { round2 } from "@/lib/journal"
import { addDays } from "@/lib/purchase"
import { productLabel, salesTotals, saveSalesInvoice } from "@/lib/sales"
import { formatDay, formatNumber, today } from "@/lib/utils"

const statusVariant = { open: "outline", partial: "secondary", paid: "default" } as const
const blankLine = (): SalesLine => ({ product: "", description: "", qty: 1, unit: "roll", price: 0, amount: 0 })

export default function SalesInvoicesPage() {
  const accounts = useCollection<Account>(ACCOUNTS).data
  const customers = useCollection<Customer>(CUSTOMERS).data
  const products = useCollection<Product>(PRODUCTS).data
  const { month, setMonth, where, skip } = useMonth()
  const invoices = useCollection<SalesInvoice>(SALES_INVOICES, { where, skip })
  const journals = useCollection<Journal>(JOURNALS, { where, skip }).data
  const [customer, setCustomer] = useState("")
  const [status, setStatus] = useState("")
  const [creating, setCreating] = useState(false)
  const [open, setOpen] = useState<Journal | null>(null)

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
    { header: "Faktur pajak", cell: (i) => i.taxInvoiceNo || "—", className: "hidden lg:table-cell" },
    { header: "DPP", cell: (i) => formatNumber(i.dpp), className: "text-right tabular-nums hidden md:table-cell" },
    { header: "PPN", cell: (i) => formatNumber(i.ppn), className: "text-right tabular-nums hidden lg:table-cell" },
    { header: "Total", cell: (i) => formatNumber(i.total), className: "text-right tabular-nums" },
    { header: "Sisa", cell: (i) => formatNumber(i.remaining), className: "text-right font-medium tabular-nums" },
    { header: "Jatuh tempo", cell: (i) => formatDay(i.dueDate), className: "hidden md:table-cell" },
    { header: "Status", cell: (i) => <Badge variant={statusVariant[i.status]}>{INVOICE_STATUS[i.status]}</Badge> },
  ]

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <MonthPicker month={month} setMonth={setMonth} />
        <FilterSelect id="filter-customer" value={customer} onChange={setCustomer} rows={customers} allLabel="Semua pelanggan" />
        <FilterSelect id="filter-status" value={status} onChange={setStatus} rows={Object.entries(INVOICE_STATUS).map(([code, name]) => ({ code, name }))} allLabel="Semua status" />
        <Button className="ml-auto" onClick={() => setCreating(true)}>
          <PlusIcon />
          Faktur baru
        </Button>
      </div>
      <DataTable columns={columns} {...invoices} data={shown} empty="Belum ada faktur penjualan di bulan ini." />
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="sm:max-w-4xl">{creating && <SalesForm customers={customers} products={products} onDone={() => setCreating(false)} />}</DialogContent>
      </Dialog>
      <JournalDialog journal={open} accounts={accounts} onClose={() => setOpen(null)} />
    </>
  )
}

function SalesForm({ customers, products, onDone }: { customers: Customer[]; products: Product[]; onDone: () => void }) {
  const [customer, setCustomer] = useState("")
  const [date, setDate] = useState(today)
  const [taxInvoiceNo, setTaxInvoiceNo] = useState("")
  const [dueOverride, setDueDate] = useState("")
  const [lines, setLines] = useState<SalesLine[]>([blankLine()])
  const [vatPct, setVatPct] = useState<number | null>(11)
  const [dppOverride, setDppRounded] = useState<number | null>(null)
  const [ppnOverride, setPpnEfaktur] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // Open balance of this customer, for the credit-limit warning.
  const theirs = useCollection<SalesInvoice>(SALES_INVOICES, { where: [["customer", "==", customer]], skip: !customer }).data

  const chosen = customers.find((c) => c.code === customer)
  const dueDate = dueOverride || (date ? addDays(date, chosen?.paymentDays ?? 30) : "")
  const totals = salesTotals(lines, vatPct ?? 0)
  const dppRounded = dppOverride ?? totals.dppRounded
  const ppnEfaktur = ppnOverride ?? totals.ppnEfaktur
  const openBalance = round2(theirs.reduce((s, i) => s + i.remaining, 0))
  const overLimit = chosen?.creditLimit != null && openBalance + totals.total > chosen.creditLimit

  const update = (i: number, patch: Partial<SalesLine>) =>
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch, amount: round2(((patch.qty ?? l.qty) || 0) * ((patch.price ?? l.price) || 0)) } : l)))
  const pickProduct = (i: number, code: string) => {
    const p = products.find((x) => x.code === code)
    update(i, p ? { product: code, description: `${code} ${productLabel(p)}`, unit: p.unit || "roll", price: p.price ?? 0 } : { product: "" })
  }

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!chosen) return setError("Pilih pelanggan.")
    if (overLimit && !confirm(`Saldo terbuka ${chosen.name} akan menjadi ${formatNumber(openBalance + totals.total)}, melebihi batas kredit ${formatNumber(chosen.creditLimit)}. Tetap simpan?`)) return
    setSaving(true)
    try {
      const number = await saveSalesInvoice({ customer, customerName: chosen.name, date, taxInvoiceNo: taxInvoiceNo.trim(), dueDate, lines, vatPct: vatPct ?? 0, dppRounded, ppnEfaktur })
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
        <div className="grid gap-4 sm:grid-cols-4">
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="customer">Pelanggan</FieldLabel>
            <SimpleSelect id="customer" value={customer} onChange={setCustomer} options={customers.filter((c) => c.active).map((c) => ({ value: c.code, label: `${c.code} · ${c.name}` }))} required />
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
              <NumberInput className="sm:col-span-2" placeholder="Roll" value={line.qty || null} onChange={(qty) => update(i, { qty: qty ?? 0 })} step={1} />
              <NumberInput className="sm:col-span-3" placeholder="Harga satuan" value={line.price || null} onChange={(price) => update(i, { price: price ?? 0 })} />
              <div className="text-right text-sm font-medium tabular-nums sm:col-span-6">Rp {formatNumber(line.amount)}</div>
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
        {error && <FieldError>{error}</FieldError>}
      </FieldGroup>
      <DialogFooter>
        <DialogClose render={<Button variant="outline" type="button" />}>Batal</DialogClose>
        <Button type="submit" disabled={saving || !totals.dpp}>
          {saving ? "Menyimpan…" : "Simpan & buat jurnal"}
        </Button>
      </DialogFooter>
    </form>
  )
}
