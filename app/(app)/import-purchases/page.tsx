"use client"

import { useState } from "react"
import { toast } from "sonner"
import { PlusIcon } from "lucide-react"

import { AccountSelect } from "@/components/account-select"
import { DataTable, type Column } from "@/components/data-table"
import { JournalDialog } from "@/components/journal-view"
import { MonthPicker, useMonth } from "@/components/month-picker"
import { NumberInput } from "@/components/number-input"
import { SimpleSelect } from "@/components/simple-select"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useCollection } from "@/hooks/use-collection"
import { ACCOUNTS, BANKS, IMPORT_PURCHASES, JOURNALS, PURCHASE_ACCOUNTS, type Account, type BankId, type ImportPurchase, type Journal } from "@/lib/collections"
import { importTotals, saveImportPurchase, type ImportInput } from "@/lib/purchase"
import { formatDay, formatNumber, today } from "@/lib/utils"

const TERMS = ["FOB", "CIF", "CFR", "EXW", "DDP"]

export default function ImportPurchasesPage() {
  const accounts = useCollection<Account>(ACCOUNTS).data
  const { month, setMonth, skip } = useMonth()
  const [start, end] = month ? [`${month}-01`, `${month}-32`] : ["", ""]
  const imports = useCollection<ImportPurchase>(IMPORT_PURCHASES, { where: [["pibDate", ">=", start], ["pibDate", "<", end]], skip })
  const journals = useCollection<Journal>(JOURNALS, { where: [["date", ">=", start], ["date", "<", end]], skip }).data
  const [creating, setCreating] = useState(false)
  const [open, setOpen] = useState<Journal | null>(null)

  const columns: Column<ImportPurchase>[] = [
    {
      header: "No.",
      cell: (p) => (
        <button type="button" className="font-medium underline-offset-4 hover:underline" onClick={() => setOpen(journals.find((j) => j.id === p.journalId) ?? null)} title="Buka jurnal">
          {p.number}
        </button>
      ),
    },
    { header: "Tgl PIB", cell: (p) => formatDay(p.pibDate) },
    { header: "NOPEN", cell: (p) => p.nopen },
    { header: "Penjual", cell: (p) => <span className="whitespace-normal">{p.seller}</span> },
    { header: "Barang", cell: (p) => <span className="whitespace-normal">{p.goods}</span>, className: "hidden lg:table-cell" },
    { header: "Invoice", cell: (p) => `${p.currency} ${formatNumber(p.invoiceAmount)}`, className: "text-right tabular-nums" },
    { header: "Nilai pabean Rp", cell: (p) => formatNumber(p.customsValueRp), className: "text-right tabular-nums hidden md:table-cell" },
    { header: "Pajak impor", cell: (p) => formatNumber(p.totalTax), className: "text-right tabular-nums" },
  ]

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <MonthPicker month={month} setMonth={setMonth} />
        <Button className="ml-auto" onClick={() => setCreating(true)}>
          <PlusIcon />
          PIB baru
        </Button>
      </div>
      <DataTable columns={columns} {...imports} data={[...imports.data].sort((a, b) => b.pibDate.localeCompare(a.pibDate))} empty="Belum ada pembelian impor di bulan ini." />
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="sm:max-w-4xl">{creating && <ImportForm accounts={accounts} onDone={() => setCreating(false)} />}</DialogContent>
      </Dialog>
      <JournalDialog journal={open} accounts={accounts} onClose={() => setOpen(null)} />
    </>
  )
}

function ImportForm({ accounts, onDone }: { accounts: Account[]; onDone: () => void }) {
  const [f, setF] = useState<ImportInput>(() => ({
    pibDate: today(),
    nopen: "",
    shipper: "",
    seller: "",
    invoiceNo: "",
    invoiceDate: "",
    containers: "",
    containerCount: null,
    goods: "",
    term: "CIF",
    currency: "USD",
    invoiceAmount: 0,
    customsValue: 0,
    rate: 0,
    duty: 0,
    pph22: 0,
    importVat: 0,
    ntpn: "",
    goodsAccount: "",
    payableAccount: PURCHASE_ACCOUNTS.payableUsd,
    bank: "bca1",
    differenceAccount: "",
  }))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const set = (patch: Partial<ImportInput>) => setF((x) => ({ ...x, ...patch }))
  const t = importTotals(f)
  const text = (key: keyof ImportInput, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <Field>
      <FieldLabel htmlFor={key}>{label}</FieldLabel>
      <Input id={key} value={f[key] as string} onChange={(e) => set({ [key]: e.target.value } as Partial<ImportInput>)} {...props} />
    </Field>
  )
  const amount = (key: keyof ImportInput, label: string, required = false) => (
    <Field>
      <FieldLabel htmlFor={key}>{label}</FieldLabel>
      <NumberInput id={key} value={(f[key] as number) || null} onChange={(v) => set({ [key]: v ?? 0 } as Partial<ImportInput>)} required={required} />
    </Field>
  )

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!f.goodsAccount) return setError("Pilih akun barang (persediaan atau aset).")
    setSaving(true)
    try {
      const number = await saveImportPurchase(f)
      toast.success(`Impor pembelian ${number} disimpan.`)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit}>
      <DialogHeader>
        <DialogTitle>Pembelian impor (PIB)</DialogTitle>
      </DialogHeader>
      <FieldGroup className="my-6">
        <div className="grid gap-4 sm:grid-cols-4">
          {text("pibDate", "Tanggal PIB", { type: "date", required: true })}
          {text("nopen", "NOPEN PIB", { required: true })}
          {text("shipper", "Shipper")}
          {text("seller", "Penjual", { required: true })}
          {text("invoiceNo", "No. invoice")}
          {text("invoiceDate", "Tanggal invoice", { type: "date" })}
          {text("containers", "No. kontainer")}
          {amount("containerCount", "Jumlah kontainer")}
        </div>
        <div className="grid gap-4 sm:grid-cols-4">
          <div className="sm:col-span-2">{text("goods", "Barang", { required: true })}</div>
          <Field>
            <FieldLabel htmlFor="term">Term</FieldLabel>
            <SimpleSelect id="term" value={f.term} onChange={(term) => set({ term })} options={TERMS.map((x) => ({ value: x, label: x }))} />
          </Field>
          {text("currency", "Mata uang", { required: true })}
          {amount("invoiceAmount", `Nilai invoice (${f.currency})`, true)}
          {amount("customsValue", `Nilai pabean (${f.currency})`, true)}
          {amount("rate", "Kurs", true)}
          <Field>
            <FieldLabel>Nilai pabean Rp</FieldLabel>
            <div className="flex h-8 items-center font-medium tabular-nums">{formatNumber(t.customsValueRp)}</div>
          </Field>
          {amount("duty", "Bea masuk (BM)")}
          {amount("pph22", "PPh 22")}
          {amount("importVat", "PPN impor")}
          <Field>
            <FieldLabel>Total pajak impor</FieldLabel>
            <div className="flex h-8 items-center font-medium tabular-nums">{formatNumber(t.totalTax)}</div>
          </Field>
          {text("ntpn", "NTPN")}
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field>
            <FieldLabel htmlFor="goodsAccount">Akun barang (debit)</FieldLabel>
            <AccountSelect id="goodsAccount" value={f.goodsAccount} onChange={(goodsAccount) => set({ goodsAccount })} accounts={accounts} placeholder="Persediaan atau aset" required />
          </Field>
          <Field>
            <FieldLabel htmlFor="payableAccount">Hutang ke penjual (kredit)</FieldLabel>
            <AccountSelect id="payableAccount" value={f.payableAccount} onChange={(payableAccount) => set({ payableAccount })} accounts={accounts} required />
          </Field>
          <Field>
            <FieldLabel htmlFor="bank">Pajak dibayar dari</FieldLabel>
            <SimpleSelect id="bank" value={f.bank} onChange={(b) => set({ bank: b as BankId })} options={BANKS.map((b) => ({ value: b.id, label: b.name }))} />
          </Field>
        </div>
        {t.difference !== 0 && (
          <Field>
            <FieldLabel htmlFor="differenceAccount">Akun selisih nilai pabean</FieldLabel>
            <AccountSelect id="differenceAccount" value={f.differenceAccount} onChange={(differenceAccount) => set({ differenceAccount })} accounts={accounts} required />
            <FieldDescription>
              Nilai pabean Rp ({formatNumber(t.customsValueRp)}) berbeda {formatNumber(t.difference)} dari invoice × kurs ({formatNumber(t.payable)}), mis.
              ongkos angkut atau asuransi.
            </FieldDescription>
          </Field>
        )}
        <div className="rounded-lg bg-muted/50 p-3 text-sm tabular-nums">
          Jurnal: barang <strong>{formatNumber(t.customsValueRp + (f.duty || 0))}</strong> · PPh 22 <strong>{formatNumber(f.pph22)}</strong> · PPN impor{" "}
          <strong>{formatNumber(f.importVat)}</strong> (debit) — hutang penjual <strong>{formatNumber(t.payable)}</strong> · bank{" "}
          <strong>{formatNumber(t.totalTax)}</strong> (kredit)
        </div>
        {error && <FieldError>{error}</FieldError>}
      </FieldGroup>
      <DialogFooter>
        <DialogClose render={<Button variant="outline" type="button" />}>Batal</DialogClose>
        <Button type="submit" disabled={saving}>
          {saving ? "Menyimpan…" : "Simpan & buat jurnal"}
        </Button>
      </DialogFooter>
    </form>
  )
}
