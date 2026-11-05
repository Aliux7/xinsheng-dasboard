"use client"

import { useState } from "react"
import { BookCheckIcon } from "lucide-react"
import { toast } from "sonner"

import { JournalView } from "@/components/journal-view"
import { MonthPicker } from "@/components/month-picker"
import { NumberInput } from "@/components/number-input"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { useCollection } from "@/hooks/use-collection"
import { useLedger } from "@/hooks/use-ledger"
import { COGS_ACCOUNTS, computeCogs, monthValues, postCogs, valueMovements } from "@/lib/costing"
import { INVENTORY_ITEMS, INVENTORY_MOVEMENTS, type InventoryItem, type InventoryMovement } from "@/lib/inventory"
import { cancelJournal } from "@/lib/journal"
import { cn, formatNumber, today } from "@/lib/utils"

/** The month's cost of goods sold from stock usage and production costs, posted as one HPP journal. */
export default function CogsPage() {
  const ledger = useLedger()
  const items = useCollection<InventoryItem>(INVENTORY_ITEMS)
  const movements = useCollection<InventoryMovement>(INVENTORY_MOVEMENTS)
  const [month, setMonth] = useState(() => today().slice(0, 7))
  const [wipEnd, setWipEnd] = useState<number | null>(null)
  const [fgEnd, setFgEnd] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  const posted = ledger.journals.find((j) => j.id === `HPP-${month}`)
  const months = monthValues(items.data, valueMovements(movements.data), month)
  const c = computeCogs({
    month,
    journals: ledger.journals,
    accounts: ledger.accounts,
    months,
    wipEnd: posted ? (posted.cogs?.wipEnd ?? 0) : (wipEnd ?? 0),
    fgEnd: posted ? (posted.cogs?.fgEnd ?? 0) : (fgEnd ?? 0),
  })
  // A posted month whose stock or costs changed afterwards.
  const stale = posted && (posted.cogs?.usage !== c.usageTotal || posted.cogs?.costs !== c.costsTotal || posted.cogs?.cogs !== c.cogs)
  const loading = ledger.loading || items.loading || movements.loading

  async function run(action: () => Promise<string>, done: (n: string) => string) {
    setBusy(true)
    try {
      toast.success(done(await action()))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
    setBusy(false)
  }

  const row = (label: string, value: number, opts: { strong?: boolean; sign?: "+" | "−"; note?: string } = {}) => (
    <tr className={cn("border-b last:border-0", opts.strong && "bg-brand-soft/60 font-medium text-brand")}>
      <td className="px-3 py-2">
        {opts.sign && <span className="mr-2 text-muted-foreground">{opts.sign}</span>}
        {label}
        {opts.note && <div className="text-xs text-muted-foreground">{opts.note}</div>}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">{formatNumber(value)}</td>
    </tr>
  )

  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <MonthPicker month={month} onChange={setMonth} />
        {posted ? <Badge variant="success">Sudah diposting: {posted.number}</Badge> : <Badge variant="warning">Belum diposting</Badge>}
      </div>
      <p className="text-sm text-muted-foreground">
        Bahan baku yang dipakai (nilai rata-rata) dan biaya produksi (akun 5xxxxx) bulan ini masuk ke barang dalam proses ({COGS_ACCOUNTS.wip}), lalu barang jadi (
        {COGS_ACCOUNTS.fg}), lalu HPP ({COGS_ACCOUNTS.cogs}). Isi nilai barang dalam proses dan barang jadi yang masih tersisa di akhir bulan; 0 bila semua
        produksi sudah terjual.
      </p>
      {stale && (
        <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">
          Data bulan ini berubah setelah HPP diposting (sekarang HPP {formatNumber(c.cogs)}). Batalkan lalu posting ulang.
        </p>
      )}

      {!posted && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="wip">Barang dalam proses akhir bulan (Rp)</FieldLabel>
            <NumberInput id="wip" value={wipEnd} onChange={setWipEnd} placeholder="0" />
            <FieldDescription>Dari hitung fisik produksi yang belum selesai.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="fg">Barang jadi akhir bulan (Rp)</FieldLabel>
            <NumberInput id="fg" value={fgEnd} onChange={setFgEnd} placeholder="0" />
            <FieldDescription>Barang jadi yang belum terjual.</FieldDescription>
          </Field>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <tbody>
            {c.usage.map((u) => row(`Pemakaian bahan baku · ${ledger.label(u.account)}`, u.value, { sign: "+" }))}
            {!c.usage.length && row("Pemakaian bahan baku", 0, { sign: "+", note: "Belum ada stok keluar (pemakaian) bulan ini." })}
            {c.costs.map((x) => row(`Biaya produksi · ${ledger.label(x.account)}`, x.amount, { sign: "+", note: x.to !== x.account ? `dialokasikan lewat ${x.to}` : undefined }))}
            {row("Total biaya produksi", c.usageTotal + c.costsTotal, { strong: true })}
            {row("Barang dalam proses awal bulan", c.wipBegin, { sign: "+" })}
            {row("Barang dalam proses akhir bulan", c.wipEnd, { sign: "−" })}
            {row("Barang selesai diproduksi", c.manufactured, { strong: true })}
            {row("Barang jadi awal bulan", c.fgBegin, { sign: "+" })}
            {row("Barang jadi akhir bulan", c.fgEnd, { sign: "−" })}
            {row("Harga pokok penjualan (HPP)", c.cogs, { strong: true })}
          </tbody>
        </table>
      </div>

      {c.problems.length > 0 && (
        <ul className="list-inside list-disc rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">
          {c.problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}

      {posted ? (
        <div className="rounded-xl border p-4">
          <JournalView
            plain
            journal={posted}
            label={ledger.label}
            busy={busy}
            onCancel={(j) => confirm(`Batalkan HPP ${month}?`) && run(() => cancelJournal(j.id), (n) => `HPP ${n} dibatalkan.`)}
          />
        </div>
      ) : (
        <Button className="w-fit" onClick={() => run(() => postCogs(c), (n) => `HPP ${n} diposting.`)} disabled={busy || loading || c.problems.length > 0 || !c.lines.length}>
          <BookCheckIcon />
          Posting HPP {month}
        </Button>
      )}
    </div>
  )
}
