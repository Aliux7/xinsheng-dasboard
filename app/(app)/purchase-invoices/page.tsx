"use client"

import { useState } from "react"
import { toast } from "sonner"
import { PlusIcon, Trash2Icon } from "lucide-react"

import { AccountSelect } from "@/components/account-select"
import { DataTable, type Column } from "@/components/data-table"
import { FilterSelect } from "@/components/filter-select"
import { JournalDialog } from "@/components/journal-view"
import { MonthPicker, useMonth } from "@/components/month-picker"
import { NumberInput } from "@/components/number-input"
import { SimpleSelect } from "@/components/simple-select"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useCollection } from "@/hooks/use-collection"
import {
  ACCOUNTS,
  INVOICE_STATUS,
  JOURNALS,
  MATCH_TOLERANCE,
  MATERIAL_MAPS,
  PURCHASE_INVOICES,
  PURCHASE_ITEMS,
  SUPPLIERS,
  WEIGHINGS,
  WITHHOLDING,
  type Account,
  type Journal,
  type MaterialMap,
  type PurchaseInvoice,
  type PurchaseItem,
  type PurchaseLine,
  type Supplier,
  type Weighing,
  type Withholding,
} from "@/lib/collections"
import { round2 } from "@/lib/journal"
import { addDays, invoiceTotals, matchDifference, savePurchaseInvoice } from "@/lib/purchase"
import { formatDay, formatNumber, today } from "@/lib/utils"

const statusVariant = { open: "outline", partial: "secondary", paid: "default" } as const
const blankLine = (): PurchaseLine => ({ item: "", description: "", account: "", qty: 1, unit: "", price: 0, amount: 0 })

export default function PurchaseInvoicesPage() {
  const accounts = useCollection<Account>(ACCOUNTS).data
  const suppliers = useCollection<Supplier>(SUPPLIERS).data
  const items = useCollection<PurchaseItem>(PURCHASE_ITEMS).data
  const { month, setMonth, where, skip } = useMonth()
  const invoices = useCollection<PurchaseInvoice>(PURCHASE_INVOICES, { where, skip })
  const journals = useCollection<Journal>(JOURNALS, { where, skip }).data
  const [supplier, setSupplier] = useState("")
  const [status, setStatus] = useState("")
  const [creating, setCreating] = useState(false)
  const [open, setOpen] = useState<Journal | null>(null)

  const shown = invoices.data
    .filter((i) => (!supplier || i.supplier === supplier) && (!status || i.status === status))
    .sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number, undefined, { numeric: true }))

  const columns: Column<PurchaseInvoice>[] = [
    {
      header: "No.",
      cell: (i) => (
        <button type="button" className="font-medium underline-offset-4 hover:underline" onClick={() => setOpen(journals.find((j) => j.id === i.journalId) ?? null)} title="Buka jurnal">
          {i.number}
        </button>
      ),
    },
    { header: "Tanggal", cell: (i) => formatDay(i.date) },
    { header: "Pemasok", cell: (i) => <span className="whitespace-normal">{i.supplierName}</span> },
    { header: "No. faktur pemasok", cell: (i) => i.supplierInvoiceNo || "—", className: "hidden lg:table-cell" },
    { header: "DPP", cell: (i) => formatNumber(i.dpp), className: "text-right tabular-nums hidden md:table-cell" },
    { header: "PPN", cell: (i) => formatNumber(i.ppn), className: "text-right tabular-nums hidden lg:table-cell" },
    { header: "PPh", cell: (i) => formatNumber(i.pph), className: "text-right tabular-nums hidden lg:table-cell" },
    { header: "Hutang", cell: (i) => formatNumber(i.payable), className: "text-right tabular-nums" },
    { header: "Sisa", cell: (i) => formatNumber(i.remaining), className: "text-right font-medium tabular-nums" },
    { header: "Jatuh tempo", cell: (i) => formatDay(i.dueDate), className: "hidden md:table-cell" },
    { header: "Status", cell: (i) => <Badge variant={statusVariant[i.status]}>{INVOICE_STATUS[i.status]}</Badge> },
  ]

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <MonthPicker month={month} setMonth={setMonth} />
        <FilterSelect id="filter-supplier" value={supplier} onChange={setSupplier} rows={suppliers} allLabel="Semua pemasok" />
        <FilterSelect
          id="filter-status"
          value={status}
          onChange={setStatus}
          rows={Object.entries(INVOICE_STATUS).map(([code, name]) => ({ code, name }))}
          allLabel="Semua status"
        />
        <Button className="ml-auto" onClick={() => setCreating(true)}>
          <PlusIcon />
          Faktur baru
        </Button>
      </div>
      <DataTable columns={columns} {...invoices} data={shown} empty="Belum ada faktur pembelian di bulan ini." />
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="sm:max-w-5xl">
          {creating && <InvoiceForm accounts={accounts} suppliers={suppliers} items={items} onDone={() => setCreating(false)} />}
        </DialogContent>
      </Dialog>
      <JournalDialog journal={open} accounts={accounts} onClose={() => setOpen(null)} />
    </>
  )
}

function InvoiceForm({ accounts, suppliers, items, onDone }: { accounts: Account[]; suppliers: Supplier[]; items: PurchaseItem[]; onDone: () => void }) {
  const [supplier, setSupplier] = useState("")
  const [date, setDate] = useState(today)
  const [supplierInvoiceNo, setSupplierInvoiceNo] = useState("")
  const [taxInvoiceNo, setTaxInvoiceNo] = useState("")
  const [taxInvoiceDate, setTaxInvoiceDate] = useState("")
  const [dueOverride, setDueDate] = useState("")
  const [lines, setLines] = useState<PurchaseLine[]>([blankLine()])
  const [vatPct, setVatPct] = useState<number | null>(11)
  const [withholding, setWithholding] = useState<Withholding>("none")
  const [whtPct, setWhtPct] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [picked, setPicked] = useState<string[]>([])
  const maps = useCollection<MaterialMap>(MATERIAL_MAPS).data
  const candidates = useCollection<Weighing>(WEIGHINGS, { where: [["supplier", "==", supplier], ["status", "==", "stocked"]], skip: !supplier }).data

  const chosen = suppliers.find((s) => s.code === supplier)
  // Weighing matching: open deliveries of materials mapped to this invoice's items.
  const lineItems = new Set(lines.map((l) => l.item).filter(Boolean))
  const mappedMaterials = maps.filter((m) => m.items.some((i) => lineItems.has(i))).map((m) => m.id)
  const open = candidates.filter((wg) => !wg.invoiceId && mappedMaterials.includes(wg.material))
  const mappedItems = new Set(maps.filter((m) => mappedMaterials.includes(m.id)).flatMap((m) => m.items))
  const invoicedKg = round2(lines.filter((l) => mappedItems.has(l.item)).reduce((s, l) => s + (l.qty || 0), 0))
  const weighedKg = round2(open.filter((wg) => picked.includes(wg.id)).reduce((s, wg) => s + (wg.net ?? 0), 0))
  const diff = matchDifference(invoicedKg, weighedKg)
  // Due date follows the supplier's terms unless changed by hand.
  const dueDate = dueOverride || (date ? addDays(date, chosen?.paymentDays ?? 30) : "")
  const totals = invoiceTotals(lines, vatPct ?? 0, withholding, whtPct ?? 0)
  const update = (i: number, patch: Partial<PurchaseLine>) =>
    setLines((ls) =>
      ls.map((l, j) => {
        if (j !== i) return l
        const next = { ...l, ...patch }
        return { ...next, amount: round2((next.qty || 0) * (next.price || 0)) }
      })
    )
  const pickItem = (i: number, code: string) => {
    const item = items.find((it) => it.code === code)
    update(i, item ? { item: code, description: item.name, unit: item.unit, account: item.account } : { item: "" })
  }

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!chosen) return setError("Pilih pemasok.")
    if (lines.some((l) => l.amount && !l.account)) return setError("Setiap baris perlu akun.")
    setSaving(true)
    try {
      const number = await savePurchaseInvoice({
        supplier,
        supplierName: chosen.name,
        supplierInvoiceNo: supplierInvoiceNo.trim(),
        date,
        taxInvoiceNo: taxInvoiceNo.trim(),
        taxInvoiceDate,
        dueDate,
        lines,
        vatPct: vatPct ?? 0,
        withholding,
        whtPct: whtPct ?? 0,
        weighings: picked.filter((id) => open.some((wg) => wg.id === id)),
      })
      toast.success(`Faktur pembelian ${number} disimpan.`)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit}>
      <DialogHeader>
        <DialogTitle>Faktur pembelian</DialogTitle>
      </DialogHeader>
      <FieldGroup className="my-6">
        <div className="grid gap-4 sm:grid-cols-4">
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="supplier">Pemasok</FieldLabel>
            <SimpleSelect
              id="supplier"
              value={supplier}
              onChange={setSupplier}
              options={suppliers.filter((s) => s.active).map((s) => ({ value: s.code, label: `${s.code} · ${s.name}` }))}
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="supplierInvoiceNo">No. faktur pemasok</FieldLabel>
            <Input id="supplierInvoiceNo" value={supplierInvoiceNo} onChange={(e) => setSupplierInvoiceNo(e.target.value)} required />
          </Field>
          <Field>
            <FieldLabel htmlFor="date">Tanggal faktur</FieldLabel>
            <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </Field>
          <Field>
            <FieldLabel htmlFor="taxInvoiceNo">No. faktur pajak</FieldLabel>
            <Input id="taxInvoiceNo" value={taxInvoiceNo} onChange={(e) => setTaxInvoiceNo(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="taxInvoiceDate">Tanggal faktur pajak</FieldLabel>
            <Input id="taxInvoiceDate" type="date" value={taxInvoiceDate} onChange={(e) => setTaxInvoiceDate(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="dueDate">Jatuh tempo</FieldLabel>
            <Input id="dueDate" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />
          </Field>
        </div>

        <div className="flex flex-col gap-2">
          {lines.map((line, i) => (
            <div key={i} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-12">
              <div className="sm:col-span-4">
                <SimpleSelect
                  id={`item-${i}`}
                  value={line.item || "*"}
                  onChange={(v) => pickItem(i, v === "*" ? "" : v)}
                  options={[{ value: "*", label: "Teks bebas" }, ...items.filter((it) => it.active).map((it) => ({ value: it.code, label: `${it.code} · ${it.name}` }))]}
                />
              </div>
              <Input className="sm:col-span-4" placeholder="Keterangan" value={line.description} onChange={(e) => update(i, { description: e.target.value })} />
              <div className="sm:col-span-4">
                <AccountSelect value={line.account} onChange={(account) => update(i, { account })} accounts={accounts} placeholder="Akun (debit)" />
              </div>
              <NumberInput className="sm:col-span-2" placeholder="Qty" value={line.qty || null} onChange={(qty) => update(i, { qty: qty ?? 0 })} />
              <Input className="sm:col-span-2" placeholder="Satuan" value={line.unit} onChange={(e) => update(i, { unit: e.target.value })} />
              <NumberInput className="sm:col-span-3" placeholder="Harga satuan" value={line.price || null} onChange={(price) => update(i, { price: price ?? 0 })} />
              <div className="flex items-center justify-end text-sm font-medium tabular-nums sm:col-span-4">Rp {formatNumber(line.amount)}</div>
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

        {open.length > 0 && (
          <div className="flex flex-col gap-2 rounded-lg border p-3 text-sm">
            <div className="font-medium">Timbangan yang dibayar faktur ini</div>
            {open.map((wg) => (
              <label key={wg.id} className="flex items-center gap-2">
                <Checkbox checked={picked.includes(wg.id)} onCheckedChange={(on) => setPicked((p) => (on ? [...p, wg.id] : p.filter((x) => x !== wg.id)))} />
                <span className="w-32 font-medium">{wg.number}</span>
                <span className="w-24">{formatDay(wg.date)}</span>
                <span className="w-20">{wg.material}</span>
                <span className="ml-auto tabular-nums">{formatNumber(wg.net)} kg</span>
              </label>
            ))}
            {picked.length > 0 && (
              <p className={Math.abs(diff) > MATCH_TOLERANCE ? "font-medium text-amber-600" : "text-muted-foreground"}>
                Difaktur {formatNumber(invoicedKg)} kg · ditimbang {formatNumber(weighedKg)} kg · selisih {formatNumber(round2(invoicedKg - weighedKg))} kg (
                {formatNumber(round2(diff * 100))}%)
                {Math.abs(diff) > MATCH_TOLERANCE && ` — di atas ${MATCH_TOLERANCE * 100}%, perlu persetujuan Admin sebelum dibayar`}
              </p>
            )}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <Field>
            <FieldLabel htmlFor="vatPct">PPN %</FieldLabel>
            <NumberInput id="vatPct" value={vatPct} onChange={setVatPct} />
          </Field>
          <Field>
            <FieldLabel htmlFor="withholding">Potongan PPh</FieldLabel>
            <SimpleSelect
              id="withholding"
              value={withholding}
              onChange={(v) => setWithholding(v as Withholding)}
              options={Object.entries(WITHHOLDING).map(([value, label]) => ({ value, label }))}
            />
          </Field>
          {withholding !== "none" && (
            <Field>
              <FieldLabel htmlFor="whtPct">PPh %</FieldLabel>
              <NumberInput id="whtPct" value={whtPct} onChange={setWhtPct} required />
            </Field>
          )}
        </div>
        <div className="grid grid-cols-2 gap-4 rounded-lg bg-muted/50 p-3 text-sm sm:grid-cols-4">
          {[
            ["DPP", totals.dpp],
            ["PPN", totals.ppn],
            ["PPh", -totals.pph],
            ["Hutang", totals.payable],
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
