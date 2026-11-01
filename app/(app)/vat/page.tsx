"use client"

import { useState } from "react"
import { LockIcon } from "lucide-react"
import { toast } from "sonner"

import { useCanCloseMonth } from "@/components/auth-provider"
import { DataTable, type Column } from "@/components/data-table"
import { JournalView } from "@/components/journal-view"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { useCollection } from "@/hooks/use-collection"
import { useToday } from "@/hooks/use-today"
import { NumberInput } from "@/components/number-input"
import { ACCOUNTS, JOURNALS, VAT_PERIODS, type Account, type Journal, type VatPeriod } from "@/lib/collections"
import { markVatReported, vatYear, type VatMonth } from "@/lib/vat-report"
import { formatNumber } from "@/lib/utils"

type Figure = "vatInLocal" | "vatInImport" | "vatOut" | "sales"
const FIGURES: [Figure, string][] = [
  ["vatInLocal", "PPN masukan (lokal)"],
  ["vatInImport", "PPN masukan (impor)"],
  ["vatOut", "PPN keluaran"],
  ["sales", "Penjualan"],
]

export default function VatPage() {
  const canMark = useCanCloseMonth()
  const thisYear = Number(useToday()?.slice(0, 4) ?? 0)
  const [picked, setYear] = useState<number | null>(null)
  const year = picked ?? thisYear
  const accounts = useCollection<Account>(ACCOUNTS).data
  const journals = useCollection<Journal>(JOURNALS, { where: [["date", "<", `${year + 1}-01-01`]], skip: !year })
  const periods = useCollection<VatPeriod>(VAT_PERIODS).data
  const [open, setOpen] = useState<{ title: string; entries: Journal[] } | null>(null)

  const rows = year ? vatYear(journals.data, year).map((r) => ({ ...r, id: r.month })) : []
  const drill = (r: VatMonth, key: Figure, label: string) => (
    <button type="button" className="tabular-nums underline-offset-4 hover:underline" onClick={() => setOpen({ title: `${label} ${r.month}`, entries: r.entries[key] })} disabled={!r[key]}>
      {r[key] ? formatNumber(r[key]) : "—"}
    </button>
  )

  const columns: Column<VatMonth & { id: string }>[] = [
    { header: "Bulan", cell: (r) => <span className="font-medium">{r.month}</span> },
    { header: "Kompensasi masuk", cell: (r) => (r.carriedIn ? formatNumber(r.carriedIn) : "—"), className: "text-right tabular-nums" },
    ...FIGURES.slice(0, 3).map(([key, label]) => ({ header: label, cell: (r: VatMonth) => drill(r, key, label), className: "text-right" })),
    {
      header: "Hasil",
      cell: (r) =>
        r.result > 0 ? (
          <span className="font-semibold text-destructive tabular-nums">Kurang bayar {formatNumber(r.result)}</span>
        ) : r.result < 0 ? (
          <span className="font-medium text-green-600 tabular-nums">Lebih bayar {formatNumber(-r.result)} → kompensasi</span>
        ) : (
          "—"
        ),
      className: "text-right",
    },
    { header: "Penjualan", cell: (r) => drill(r, "sales", "Penjualan"), className: "text-right" },
    {
      header: "Status",
      cell: (r) => {
        const reported = periods.find((p) => p.id === r.month)?.reported
        return reported ? (
          <Badge variant="secondary" title="Faktur di bulan ini dikunci">
            <LockIcon /> Dilaporkan
          </Badge>
        ) : canMark ? (
          <Button size="sm" variant="ghost" onClick={() => confirm(`Tandai PPN ${r.month} sudah dilaporkan? Faktur pembelian, impor dan penjualan di bulan ini akan dikunci.`) && markVatReported(r.month, true).then(() => toast.success(`PPN ${r.month} ditandai dilaporkan.`)).catch((e) => toast.error(e.message))}>
            Tandai dilaporkan
          </Button>
        ) : (
          <span className="text-muted-foreground">Belum</span>
        )
      },
    },
  ]

  return (
    <>
      <Field className="w-32">
        <FieldLabel htmlFor="year">Tahun</FieldLabel>
        <NumberInput id="year" value={year || null} onChange={(y) => y && setYear(y)} step={1} plain />
      </Field>
      <DataTable columns={columns} {...journals} data={rows} />
      <p className="text-xs text-muted-foreground">
        Dihitung dari buku besar: PPN masukan = debit 107001 (impor = jurnal dari Pembelian impor), PPN keluaran = kredit 214001, penjualan = kredit 401001.
      </p>
      <Dialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{open?.title}</DialogTitle>
          </DialogHeader>
          <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto">
            {open?.entries.map((j) => <JournalView key={j.id} journal={j} accounts={accounts} />)}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
