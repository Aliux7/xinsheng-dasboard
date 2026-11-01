"use client"

import { useState } from "react"
import { PlusIcon } from "lucide-react"
import { toast } from "sonner"

import { DataTable, type Column } from "@/components/data-table"
import { NumberInput } from "@/components/number-input"
import { SimpleSelect } from "@/components/simple-select"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useCollection } from "@/hooks/use-collection"
import { useHpp } from "@/hooks/use-hpp"
import { useToday } from "@/hooks/use-today"
import { FG_PRODUCTIONS, PRODUCTS, ROLLS, type FgProduction, type Product, type Roll } from "@/lib/collections"
import { saveProduction } from "@/lib/finished-goods"
import { round2 } from "@/lib/journal"
import { previousMonth } from "@/lib/report"
import { productLabel } from "@/lib/sales"
import { formatDay, formatNumber, today } from "@/lib/utils"

type StockRow = Product & { id: string }

export default function FinishedGoodsPage() {
  const products = useCollection<Product>(PRODUCTS)
  const productions = useCollection<FgProduction>(FG_PRODUCTIONS, { orderBy: "date", desc: true, limit: 50 })
  const [creating, setCreating] = useState(false)

  const stock = products.data.filter((p) => p.fgQty).sort((a, b) => a.code.localeCompare(b.code))
  const stockColumns: Column<StockRow>[] = [
    { header: "Produk", cell: (p) => <span className="whitespace-normal">{p.code} · {productLabel(p)}</span> },
    { header: "Roll", cell: (p) => formatNumber(p.fgQty), className: "text-right tabular-nums" },
    { header: "Nilai", cell: (p) => formatNumber(p.fgValue), className: "text-right tabular-nums" },
    { header: "Rata-rata/roll", cell: (p) => formatNumber(p.fgQty ? round2((p.fgValue ?? 0) / p.fgQty) : 0), className: "text-right tabular-nums" },
  ]
  const productionColumns: Column<FgProduction>[] = [
    { header: "No.", cell: (p) => <span className="font-medium">{p.number}</span> },
    { header: "Tanggal", cell: (p) => formatDay(p.date) },
    { header: "Produk", cell: (p) => p.product },
    { header: "Roll", cell: (p) => p.rolls, className: "text-right tabular-nums" },
    { header: "Kain (roll / kg)", cell: (p) => `${p.clothRolls.length} / ${formatNumber(p.clothKg)}`, className: "text-right tabular-nums" },
    { header: "Nilai", cell: (p) => formatNumber(p.value), className: "text-right tabular-nums" },
  ]

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold">Stok barang jadi</h2>
          <Button className="ml-auto" onClick={() => setCreating(true)}>
            <PlusIcon />
            Catat produksi
          </Button>
        </div>
        <DataTable columns={stockColumns} {...products} data={stock} empty="Belum ada stok barang jadi." />
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">Produksi terakhir</h2>
        <DataTable columns={productionColumns} {...productions} data={productions.data} empty="Belum ada produksi." />
      </section>
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="sm:max-w-2xl">{creating && <ProductionForm products={products.data} onDone={() => setCreating(false)} />}</DialogContent>
      </Dialog>
    </div>
  )
}

function ProductionForm({ products, onDone }: { products: Product[]; onDone: () => void }) {
  const month = useToday()?.slice(0, 7) ?? ""
  // Cost per kg of cloth defaults to last month's HPP.
  const { hpp } = useHpp(month ? previousMonth(month) : "")
  const rolls = useCollection<Roll>(ROLLS, { where: [["status", "==", "issued"]] }).data.filter((r) => !r.usedIn && /lamin/i.test(r.destination))
  const [date, setDate] = useState(today)
  const [product, setProduct] = useState("")
  const [qty, setQty] = useState<number | null>(null)
  const [picked, setPicked] = useState<string[]>([])
  const [costOverride, setCost] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const costPerKg = costOverride ?? hpp?.costPerKg ?? 0
  const clothKg = round2(rolls.filter((r) => picked.includes(r.id)).reduce((s, r) => s + r.kg, 0))

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    try {
      const number = await saveProduction({ date, product, rolls: qty ?? 0, clothRolls: picked, costPerKg })
      toast.success(`Produksi ${number} disimpan.`)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit}>
      <DialogHeader>
        <DialogTitle>Catat produksi barang jadi</DialogTitle>
      </DialogHeader>
      <FieldGroup className="my-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field>
            <FieldLabel htmlFor="date">Tanggal</FieldLabel>
            <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </Field>
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="product">Produk</FieldLabel>
            <SimpleSelect id="product" value={product} onChange={setProduct} options={products.filter((p) => p.active).map((p) => ({ value: p.code, label: `${p.code} · ${productLabel(p)}` }))} required />
          </Field>
          <Field>
            <FieldLabel htmlFor="qty">Roll diproduksi</FieldLabel>
            <NumberInput id="qty" value={qty} onChange={setQty} step={1} required />
          </Field>
          <Field>
            <FieldLabel htmlFor="cost">Biaya per kg kain</FieldLabel>
            <NumberInput id="cost" value={costPerKg || null} onChange={setCost} />
            <FieldDescription>Dari HPP bulan lalu; bisa diubah.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel>Nilai</FieldLabel>
            <div className="flex h-8 items-center font-medium tabular-nums">{formatNumber(round2(clothKg * costPerKg))}</div>
          </Field>
        </div>
        <Field>
          <FieldLabel>Roll kain dipakai ({picked.length} roll, {formatNumber(clothKg)} kg)</FieldLabel>
          <div className="flex max-h-56 flex-col gap-1 overflow-y-auto rounded-lg border p-2 text-sm">
            {rolls.map((r) => (
              <label key={r.id} className="flex items-center gap-2">
                <Checkbox checked={picked.includes(r.id)} onCheckedChange={(on) => setPicked((p) => (on ? [...p, r.id] : p.filter((x) => x !== r.id)))} />
                <span className="w-16 font-medium">{r.number}</span>
                <span className="w-16">{r.grade}</span>
                <span className="w-24">{formatDay(r.issueDate)}</span>
                <span className="ml-auto tabular-nums">{formatNumber(r.kg)} kg</span>
              </label>
            ))}
            {!rolls.length && <span className="text-muted-foreground">Tidak ada roll kain yang dikeluarkan ke laminasi dan belum dipakai.</span>}
          </div>
        </Field>
        {error && <FieldError>{error}</FieldError>}
      </FieldGroup>
      <DialogFooter>
        <DialogClose render={<Button variant="outline" type="button" />}>Batal</DialogClose>
        <Button type="submit" disabled={saving}>
          {saving ? "Menyimpan…" : "Simpan"}
        </Button>
      </DialogFooter>
    </form>
  )
}
