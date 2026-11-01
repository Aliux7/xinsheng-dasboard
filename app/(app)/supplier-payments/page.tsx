"use client"

import { useState } from "react"
import { CheckIcon, XIcon } from "lucide-react"
import { toast } from "sonner"

import { useIsAdmin } from "@/components/auth-provider"
import { DataTable, type Column } from "@/components/data-table"
import { MonthPicker, useMonth } from "@/components/month-picker"
import { NumberInput } from "@/components/number-input"
import { SimpleSelect } from "@/components/simple-select"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useCollection } from "@/hooks/use-collection"
import {
  BANKS,
  PAYMENT_APPROVAL_LIMIT,
  PAYMENT_STATUS,
  PURCHASE_INVOICES,
  SUPPLIERS,
  SUPPLIER_PAYMENTS,
  type BankId,
  type PurchaseInvoice,
  type Supplier,
  type SupplierPayment,
} from "@/lib/collections"
import { round2 } from "@/lib/journal"
import { approvePayment, rejectPayment, savePayment } from "@/lib/purchase"
import { formatDay, formatNumber, today } from "@/lib/utils"

const statusVariant = { pending: "secondary", posted: "outline", rejected: "destructive" } as const

export default function SupplierPaymentsPage() {
  const isAdmin = useIsAdmin()
  const suppliers = useCollection<Supplier>(SUPPLIERS).data
  const [supplier, setSupplier] = useState("")
  const { month, setMonth, where, skip } = useMonth()
  const payments = useCollection<SupplierPayment>(SUPPLIER_PAYMENTS, { where, skip })
  const waiting = useCollection<SupplierPayment>(SUPPLIER_PAYMENTS, { where: [["status", "==", "pending"]] }).data
  const rows = [...waiting, ...payments.data.filter((p) => p.status !== "pending")].sort((a, b) => b.date.localeCompare(a.date))

  const columns: Column<SupplierPayment>[] = [
    { header: "No. bukti", cell: (p) => <span className="font-medium">{p.number || "—"}</span> },
    { header: "Tanggal", cell: (p) => formatDay(p.date) },
    { header: "Pemasok", cell: (p) => <span className="whitespace-normal">{p.supplierName}</span> },
    { header: "Faktur", cell: (p) => <span className="text-xs whitespace-normal">{p.allocations.map((a) => `${a.number} ${formatNumber(a.amount)}`).join(", ")}</span>, className: "hidden lg:table-cell" },
    { header: "Bank", cell: (p) => BANKS.find((b) => b.id === p.bank)?.name, className: "hidden md:table-cell" },
    { header: "Jumlah", cell: (p) => formatNumber(p.total), className: "text-right font-medium tabular-nums" },
    { header: "Status", cell: (p) => <Badge variant={statusVariant[p.status]} title={p.rejectReason || undefined}>{PAYMENT_STATUS[p.status]}</Badge> },
    {
      header: "Disetujui",
      cell: (p) =>
        p.status === "pending" ? (
          isAdmin ? <Decide payment={p} /> : <span className="text-muted-foreground">Menunggu Admin</span>
        ) : (
          p.approvedBy?.email ?? <span className="text-muted-foreground">—</span>
        ),
    },
  ]

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4 rounded-xl border p-4">
        <h2 className="font-semibold">Bayar faktur</h2>
        <div className="w-full sm:w-80">
          <SimpleSelect
            id="supplier"
            value={supplier}
            onChange={setSupplier}
            options={suppliers.map((s) => ({ value: s.code, label: `${s.code} · ${s.name}` }))}
            placeholder="Pilih pemasok"
          />
        </div>
        {supplier && <PaymentForm key={supplier} supplier={suppliers.find((s) => s.code === supplier)!} />}
      </section>
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold">Riwayat pembayaran</h2>
          <div className="ml-auto">
            <MonthPicker month={month} setMonth={setMonth} />
          </div>
        </div>
        <DataTable columns={columns} {...payments} data={rows} empty="Belum ada pembayaran di bulan ini." />
      </section>
    </div>
  )
}

function PaymentForm({ supplier }: { supplier: Supplier }) {
  const isAdmin = useIsAdmin()
  const invoices = useCollection<PurchaseInvoice>(PURCHASE_INVOICES, { where: [["supplier", "==", supplier.code]] })
  const open = invoices.data.filter((i) => i.remaining > 0.005).sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  const [amounts, setAmounts] = useState<Record<string, number | null>>({})
  const [bank, setBank] = useState<BankId>("bca1")
  const [date, setDate] = useState(today)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const picked = open.filter((i) => amounts[i.id] != null)
  const total = round2(picked.reduce((s, i) => s + (amounts[i.id] ?? 0), 0))
  const needsApproval = total > PAYMENT_APPROVAL_LIMIT && !isAdmin

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSaving(true)
    try {
      const saved = await savePayment(
        {
          supplier: supplier.code,
          supplierName: supplier.name,
          date,
          bank,
          allocations: picked.map((i) => ({ invoice: i.id, number: i.number, amount: amounts[i.id] ?? 0 })),
        },
        isAdmin
      )
      if (saved.status === "pending") toast.info("Pembayaran menunggu persetujuan Admin; belum diposting.")
      else toast.success(`Pembayaran ${saved.number} disimpan.`)
      setAmounts({})
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
    setSaving(false)
  }

  if (!invoices.loading && !open.length) return <p className="text-sm text-muted-foreground">Tidak ada faktur terbuka untuk {supplier.name}.</p>

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 text-sm">
        {open.map((i) => (
          <div key={i.id} className="grid grid-cols-[auto_1fr_auto_10rem] items-center gap-3">
            <Checkbox
              checked={amounts[i.id] != null}
              onCheckedChange={(on) => setAmounts((a) => ({ ...a, [i.id]: on ? i.remaining : null }))}
              aria-label={`Bayar ${i.number}`}
            />
            <div className="min-w-0">
              <div className="font-medium">
                {i.number} <span className="font-normal text-muted-foreground">{i.supplierInvoiceNo}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                Jatuh tempo {formatDay(i.dueDate)} · hutang {formatNumber(i.payable)}
              </div>
            </div>
            <div className="text-right tabular-nums">sisa {formatNumber(i.remaining)}</div>
            <NumberInput
              value={amounts[i.id] ?? null}
              onChange={(v) => setAmounts((a) => ({ ...a, [i.id]: v }))}
              disabled={amounts[i.id] == null}
              aria-label={`Jumlah bayar ${i.number}`}
            />
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <Field className="w-56">
          <FieldLabel htmlFor="bank">Dari bank</FieldLabel>
          <SimpleSelect id="bank" value={bank} onChange={(b) => setBank(b as BankId)} options={BANKS.map((b) => ({ value: b.id, label: b.name }))} />
        </Field>
        <Field className="w-44">
          <FieldLabel htmlFor="date">Tanggal bayar</FieldLabel>
          <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>
        <div className="text-sm">
          <div className="text-muted-foreground">Total</div>
          <div className="text-lg font-semibold tabular-nums">{formatNumber(total)}</div>
        </div>
        <Button type="submit" className="ml-auto" disabled={saving || !total}>
          {saving ? "Menyimpan…" : needsApproval ? "Ajukan untuk disetujui" : "Bayar"}
        </Button>
      </div>
      {needsApproval && (
        <p className="text-sm text-amber-600">Di atas {formatNumber(PAYMENT_APPROVAL_LIMIT)}: perlu persetujuan Admin sebelum diposting.</p>
      )}
      {error && <FieldError>{error}</FieldError>}
    </form>
  )
}

function Decide({ payment }: { payment: SupplierPayment }) {
  const [busy, setBusy] = useState(false)
  const run = async (action: () => Promise<void>, done: string) => {
    setBusy(true)
    await action()
      .then(() => toast.success(done))
      .catch((err) => toast.error(err.message))
    setBusy(false)
  }
  return (
    <div className="flex gap-1">
      <Button size="icon-sm" variant="ghost" className="hover:bg-primary hover:text-primary-foreground" disabled={busy} onClick={() => run(() => approvePayment(payment.id), "Pembayaran disetujui.")} aria-label="Setujui" title="Setujui">
        <CheckIcon />
      </Button>
      <Button
        size="icon-sm"
        variant="ghost"
        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        disabled={busy}
        onClick={() => {
          const reason = prompt("Alasan menolak pembayaran ini?")?.trim()
          if (reason) run(() => rejectPayment(payment.id, reason), "Pembayaran ditolak.")
        }}
        aria-label="Tolak"
        title="Tolak"
      >
        <XIcon />
      </Button>
    </div>
  )
}
