"use client"

import { useState } from "react"
import { CheckCircle2Icon, TriangleAlertIcon } from "lucide-react"
import { toast } from "sonner"

import { useAuth, useCanCloseMonth } from "@/components/auth-provider"
import { DataTable } from "@/components/data-table"
import { Badge } from "@/components/ui/badge"
import { ImportHeading, ImportTemplate } from "@/components/import-template"
import { Button } from "@/components/ui/button"
import { useCollection } from "@/hooks/use-collection"
import { INVOICE_STATUS, JOURNALS, PURCHASE_ACCOUNTS, SUPPLIERS, type Journal, type Supplier } from "@/lib/collections"
import { round2 } from "@/lib/journal"
import { AP_IMPORT_DOC, AP_TEMPLATE, buildApPlan, readApSheet, runApImport, type ApPlan } from "@/lib/purchase-import"
import { formatDay, formatNumber } from "@/lib/utils"

type Marker = {
  id: string
  status: string
  by: { email: string }
  summary?: {
    invoices: number
    open: number
    ledger: number
    review: string[]
  }
}

export function PurchaseInvoiceImport() {
  const allowed = useCanCloseMonth()
  const { roleLoaded } = useAuth()
  const suppliers = useCollection<Supplier>(SUPPLIERS).data
  const idr = useCollection<Journal>(JOURNALS, {
    where: [["accounts", "array-contains", PURCHASE_ACCOUNTS.payableIdr]],
  })
  const usd = useCollection<Journal>(JOURNALS, {
    where: [["accounts", "array-contains", PURCHASE_ACCOUNTS.payableUsd]],
  })
  const marker = useCollection<Marker>(AP_IMPORT_DOC.path).data.find((m) => m.id === AP_IMPORT_DOC.id)
  const [plan, setPlan] = useState<ApPlan | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!roleLoaded) return null
  if (!allowed) return <p className="text-sm text-muted-foreground">Hanya Developer, Master atau Admin yang dapat menjalankan impor ini.</p>
  if (marker?.status === "done" && marker.summary) {
    return (
      <p className="flex max-w-2xl items-start gap-2 font-medium">
        <CheckCircle2Icon className="mt-0.5 size-5 shrink-0 text-green-600" />
        Sudah dijalankan oleh {marker.by.email}: {marker.summary.invoices} faktur, sisa hutang {formatNumber(marker.summary.open)} (buku besar{" "}
        {formatNumber(marker.summary.ledger)}). Ditinjau manual: {marker.summary.review.join(", ") || "—"}.
      </p>
    )
  }

  const journals = [...new Map([...idr.data, ...usd.data].map((j) => [j.id, j])).values()]
  const noJournals = !idr.loading && !journals.some((j) => j.imported)

  async function load(file: File | undefined) {
    setPlan(null)
    setError(null)
    if (!file) return
    try {
      setPlan(buildApPlan(journals, await readApSheet(file), suppliers))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function run() {
    if (!plan || !confirm(`Buat ${plan.invoices.length} faktur pembelian 2025 (tanpa jurnal baru)? Hanya sekali.`)) return
    setBusy(true)
    await runApImport(plan)
      .then(() => toast.success(`Impor selesai: ${plan.invoices.length} faktur pembelian dibuat.`))
      .catch((err) => setError(err.message))
    setBusy(false)
  }

  const difference = plan ? round2(plan.open - plan.ledger) : 0
  return (
    <div className="flex flex-col gap-6">
      <ImportHeading title="Impor faktur pembelian 2025">
        Membuat faktur pembelian 2025 dari jurnal impor bersumber Purchase Invoice yang mengkredit hutang usaha (211101/211102), lalu mencocokkan
        pembayaran dari buku bank. Sheet AP dipakai untuk detail; baris tanpa jurnal ditampilkan untuk ditinjau.
      </ImportHeading>
      {noJournals && <Notice>Jalankan Impor jurnal 2025 terlebih dahulu.</Notice>}
      <ImportTemplate sheets={AP_TEMPLATE} fileName="template-faktur-pembelian-2025.xlsx" onFile={load} disabled={noJournals || busy} />
      {error && <p className="text-sm text-destructive">{error}</p>}
      {plan && (
        <>
          <DataTable
            columns={[
              {
                header: "No.",
                cell: (i) => <span className="font-medium">{i.number}</span>,
              },
              { header: "Tanggal", cell: (i) => formatDay(i.date) },
              {
                header: "Pemasok",
                cell: (i) => <span className="whitespace-normal">{i.supplierName}</span>,
              },
              {
                header: "Hutang",
                cell: (i) => formatNumber(i.payable),
                className: "text-right tabular-nums",
              },
              {
                header: "Dibayar",
                cell: (i) => (i.payments.length ? `${formatNumber(i.paid)} (${i.payments.map((p) => p.number).join(", ")})` : ""),
                className: "text-right tabular-nums whitespace-normal",
              },
              {
                header: "Sisa",
                cell: (i) => formatNumber(i.remaining),
                className: "text-right font-medium tabular-nums",
              },
              {
                header: "Status",
                cell: (i) => <Badge variant="outline">{INVOICE_STATUS[i.status]}</Badge>,
              },
            ]}
            data={plan.invoices.map((i) => ({ ...i, id: i.docId }))}
            loading={false}
            error={null}
          />
          <p className={`text-sm font-medium ${difference ? "text-destructive" : "text-green-600"}`}>
            Sisa hutang {formatNumber(plan.open)} · buku besar 211101 + 211102 {formatNumber(plan.ledger)}{" "}
            {difference ? `· selisih ${formatNumber(difference)}` : "· cocok"}
          </p>
          {plan.review.length > 0 && (
            <Notice>
              Ditinjau manual (tidak dijadikan faktur):{" "}
              {plan.review.map((r) => `baris ${r.row} ${r.voucher} ${r.supplier} ${formatNumber(r.dpp || r.payable)} — ${r.reason}`).join(" · ")}
            </Notice>
          )}
          <Button className="w-fit" onClick={run} disabled={busy}>
            {busy ? "Menyimpan…" : "Jalankan impor"}
          </Button>
        </>
      )}
    </div>
  )
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex max-w-3xl items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
      <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-amber-600" />
      <span>{children}</span>
    </p>
  )
}
