"use client"

import { useState } from "react"
import { toast } from "sonner"

import { AccountSelect } from "@/components/account-select"
import { DataTable, type Column } from "@/components/data-table"
import { MonthPicker, useMonth } from "@/components/month-picker"
import { NumberInput } from "@/components/number-input"
import { SimpleSelect } from "@/components/simple-select"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useCollection } from "@/hooks/use-collection"
import {
  ACCOUNTS,
  BANKS,
  CUSTOMERS,
  CUSTOMER_RECEIPTS,
  SALES_INVOICES,
  type Account,
  type BankId,
  type Customer,
  type CustomerReceipt,
  type SalesInvoice,
} from "@/lib/collections"
import { round2 } from "@/lib/journal"
import { saveReceipt } from "@/lib/sales"
import { formatDay, formatNumber, today } from "@/lib/utils"

export default function CustomerReceiptsPage() {
  const customers = useCollection<Customer>(CUSTOMERS).data
  const accounts = useCollection<Account>(ACCOUNTS).data
  const [customer, setCustomer] = useState("")
  const { month, setMonth, where, skip } = useMonth()
  const receipts = useCollection<CustomerReceipt>(CUSTOMER_RECEIPTS, { where, skip })

  const columns: Column<CustomerReceipt>[] = [
    { header: "No. bukti", cell: (r) => <span className="font-medium">{r.number}</span> },
    { header: "Tanggal", cell: (r) => formatDay(r.date) },
    { header: "Pelanggan", cell: (r) => <span className="whitespace-normal">{r.customerName}</span> },
    { header: "Faktur", cell: (r) => <span className="text-xs whitespace-normal">{r.allocations.map((a) => `${a.number} ${formatNumber(a.amount)}`).join(", ")}</span>, className: "hidden lg:table-cell" },
    { header: "Bank", cell: (r) => BANKS.find((b) => b.id === r.bank)?.name, className: "hidden md:table-cell" },
    { header: "Diterima", cell: (r) => formatNumber(r.received), className: "text-right font-medium tabular-nums" },
    { header: "Selisih", cell: (r) => (r.difference ? formatNumber(r.difference) : ""), className: "text-right tabular-nums" },
  ]

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4 rounded-xl border p-4">
        <h2 className="font-semibold">Terima pembayaran</h2>
        <div className="w-full sm:w-80">
          <SimpleSelect id="customer" value={customer} onChange={setCustomer} options={customers.map((c) => ({ value: c.code, label: `${c.code} · ${c.name}` }))} placeholder="Pilih pelanggan" />
        </div>
        {customer && <ReceiptForm key={customer} customer={customers.find((c) => c.code === customer)!} accounts={accounts} />}
      </section>
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold">Riwayat penerimaan</h2>
          <div className="ml-auto">
            <MonthPicker month={month} setMonth={setMonth} />
          </div>
        </div>
        <DataTable columns={columns} {...receipts} data={[...receipts.data].sort((a, b) => b.date.localeCompare(a.date))} empty="Belum ada penerimaan di bulan ini." />
      </section>
    </div>
  )
}

function ReceiptForm({ customer, accounts }: { customer: Customer; accounts: Account[] }) {
  const invoices = useCollection<SalesInvoice>(SALES_INVOICES, { where: [["customer", "==", customer.code]] })
  const open = invoices.data.filter((i) => i.remaining > 0.005).sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  const [amounts, setAmounts] = useState<Record<string, number | null>>({})
  const [received, setReceived] = useState<number | null>(null)
  const [bank, setBank] = useState<BankId>("bca1")
  const [date, setDate] = useState(today)
  const [reference, setReference] = useState("")
  const [differenceAccount, setDifferenceAccount] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const picked = open.filter((i) => amounts[i.id] != null)
  const allocated = round2(picked.reduce((s, i) => s + (amounts[i.id] ?? 0), 0))
  const receivedAmount = received ?? allocated
  const difference = round2(allocated - receivedAmount)

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSaving(true)
    try {
      const number = await saveReceipt({
        customer: customer.code,
        customerName: customer.name,
        date,
        bank,
        reference: reference.trim(),
        allocations: picked.map((i) => ({ invoice: i.id, number: i.number, amount: amounts[i.id] ?? 0 })),
        received: receivedAmount,
        differenceAccount,
      })
      toast.success(`Penerimaan ${number} disimpan.`)
      setAmounts({})
      setReceived(null)
      setReference("")
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
    setSaving(false)
  }

  if (!invoices.loading && !open.length) return <p className="text-sm text-muted-foreground">Tidak ada faktur terbuka untuk {customer.name}.</p>

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 text-sm">
        {open.map((i) => (
          <div key={i.id} className="grid grid-cols-[auto_1fr_auto_10rem] items-center gap-3">
            <Checkbox checked={amounts[i.id] != null} onCheckedChange={(on) => setAmounts((a) => ({ ...a, [i.id]: on ? i.remaining : null }))} aria-label={`Terima ${i.number}`} />
            <div>
              <div className="font-medium">{i.number}</div>
              <div className="text-xs text-muted-foreground">
                Jatuh tempo {formatDay(i.dueDate)} · total {formatNumber(i.total)}
              </div>
            </div>
            <div className="text-right tabular-nums">sisa {formatNumber(i.remaining)}</div>
            <NumberInput value={amounts[i.id] ?? null} onChange={(v) => setAmounts((a) => ({ ...a, [i.id]: v }))} disabled={amounts[i.id] == null} aria-label={`Jumlah ${i.number}`} />
          </div>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <Field>
          <FieldLabel htmlFor="bank">Ke bank</FieldLabel>
          <SimpleSelect id="bank" value={bank} onChange={(b) => setBank(b as BankId)} options={BANKS.map((b) => ({ value: b.id, label: b.name }))} />
        </Field>
        <Field>
          <FieldLabel htmlFor="date">Tanggal</FieldLabel>
          <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>
        <Field>
          <FieldLabel htmlFor="reference">Referensi bank</FieldLabel>
          <Input id="reference" value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="received">Diterima di bank</FieldLabel>
          <NumberInput id="received" value={received ?? (allocated || null)} onChange={setReceived} />
        </Field>
      </div>
      {difference !== 0 && (
        <Field className="max-w-md">
          <FieldLabel htmlFor="differenceAccount">Akun selisih ({formatNumber(difference)})</FieldLabel>
          <AccountSelect id="differenceAccount" value={differenceAccount} onChange={setDifferenceAccount} accounts={accounts} placeholder="mis. biaya bank" required />
        </Field>
      )}
      <div className="flex items-center gap-4">
        <div className="text-sm">
          Dialokasikan <span className="font-semibold tabular-nums">{formatNumber(allocated)}</span>
        </div>
        <Button type="submit" className="ml-auto" disabled={saving || !allocated}>
          {saving ? "Menyimpan…" : "Simpan penerimaan"}
        </Button>
      </div>
      {error && <FieldError>{error}</FieldError>}
    </form>
  )
}
