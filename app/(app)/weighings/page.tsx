"use client"

import { useState } from "react"
import { MoreHorizontalIcon, PencilIcon, PlusIcon, ScaleIcon, XCircleIcon } from "lucide-react"
import { toast } from "sonner"

import { ArrivalDialog } from "@/app/(app)/weighings/arrival-dialog"
import { DataTable, type Column } from "@/components/data-table"
import { NumberInput } from "@/components/number-input"
import { FilterSelect } from "@/components/filter-select"
import { MonthPicker, useMonth } from "@/components/month-picker"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"
import { useCollection } from "@/hooks/use-collection"
import {
  MATERIALS,
  SUPPLIERS,
  WEIGHINGS,
  WEIGHING_STATUS,
  type Material,
  type Supplier,
  type Weighing,
} from "@/lib/collections"
import { formatDay, formatNumber } from "@/lib/utils"
import { cancelWeighing, netOf, weighOut, weightErrors, weightWarnings } from "@/lib/weighing"

const statusVariant = { onsite: "secondary", stocked: "outline", cancelled: "destructive" } as const

const byNumber = (a: Weighing, b: Weighing) => b.number.localeCompare(a.number, undefined, { numeric: true })

export default function WeighingsPage() {
  const suppliers = useCollection<Supplier>(SUPPLIERS).data
  const materials = useCollection<Material>(MATERIALS).data
  const onsite = useCollection<Weighing>(WEIGHINGS, { where: [["status", "==", "onsite"]] })

  const { month, setMonth, where, skip } = useMonth()
  const [supplier, setSupplier] = useState("")
  const [material, setMaterial] = useState("")
  const history = useCollection<Weighing>(WEIGHINGS, { where, skip })

  const [editing, setEditing] = useState<Weighing | "new" | null>(null)
  const [cancelling, setCancelling] = useState<Weighing | null>(null)

  const name = (rows: { code: string; name: string }[], code: string) => rows.find((r) => r.code === code)?.name ?? code

  const onsiteColumns: Column<Weighing>[] = [
    { header: "No. dokumen", cell: (t) => <span className="font-medium">{t.number}</span> },
    { header: "No. polisi", cell: (t) => t.plate },
    { header: "Pemasok", cell: (t) => name(suppliers, t.supplier), className: "hidden md:table-cell" },
    { header: "Bahan baku", cell: (t) => name(materials, t.material), className: "hidden md:table-cell" },
    { header: "Berat masuk", cell: (t) => `${formatNumber(t.weight1)} kg`, className: "text-right tabular-nums" },
    {
      header: "Timbang keluar",
      cell: (t) => <WeighOut weighing={t} onEdit={() => setEditing(t)} onCancel={() => setCancelling(t)} />,
    },
  ]

  const historyColumns: Column<Weighing>[] = [
    { header: "No. dokumen", cell: (t) => <span className="font-medium">{t.number}</span> },
    { header: "Tanggal", cell: (t) => formatDay(t.date) },
    { header: "No. polisi", cell: (t) => t.plate },
    { header: "Pemasok", cell: (t) => name(suppliers, t.supplier), className: "hidden md:table-cell" },
    { header: "Bahan baku", cell: (t) => name(materials, t.material), className: "hidden md:table-cell" },
    { header: "Neto", cell: (t) => (t.net == null ? "—" : `${formatNumber(t.net)} kg`), className: "text-right tabular-nums" },
    {
      header: "Status",
      cell: (t) => (
        <Badge variant={statusVariant[t.status]} title={t.cancelReason || undefined}>
          {WEIGHING_STATUS[t.status]}
        </Badge>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Truk di lokasi</h2>
          <Button onClick={() => setEditing("new")}>
            <PlusIcon />
            Truk masuk
          </Button>
        </div>
        <DataTable
          columns={onsiteColumns}
          {...onsite}
          data={[...onsite.data].sort(byNumber)}
          empty="Tidak ada truk di lokasi."
        />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Riwayat</h2>
        <div className="flex flex-wrap gap-2">
          <MonthPicker month={month} setMonth={setMonth} />
          <FilterSelect id="filter-supplier" value={supplier} onChange={setSupplier} rows={suppliers} allLabel="Semua pemasok" />
          <FilterSelect id="filter-material" value={material} onChange={setMaterial} rows={materials} allLabel="Semua bahan baku" />
        </div>
        <DataTable
          columns={historyColumns}
          {...history}
          data={history.data
            .filter((t) => (!supplier || t.supplier === supplier) && (!material || t.material === material))
            .sort((a, b) => b.date.localeCompare(a.date) || byNumber(a, b))}
          empty="Tidak ada timbangan di bulan ini."
        />
      </section>

      <ArrivalDialog weighing={editing} onClose={() => setEditing(null)} suppliers={suppliers} materials={materials} />
      <CancelDialog weighing={cancelling} onClose={() => setCancelling(null)} />
    </div>
  )
}

// No background until hover, then black with a white icon.
const iconHover = "hover:bg-primary hover:text-primary-foreground"

/** Weight 2 input with live net and the "Timbang keluar" button, per truck on site. */
function WeighOut({ weighing, onEdit, onCancel }: { weighing: Weighing; onEdit: () => void; onCancel: () => void }) {
  const [weight2, setWeight2] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const net = netOf(weighing.weight1, weight2)
  const warnings = weightWarnings(weighing.weight1, weight2)

  async function submit() {
    const problem = weightErrors(weighing.weight1, weight2)
    if (problem) return toast.error(problem)
    if (warnings.length && !confirm(`${warnings.join("\n")}\n\nTetap timbang keluar?`)) return
    setBusy(true)
    await weighOut(weighing.id, weight2!)
      .then(() => toast.success(`Truk ${weighing.number} ditimbang keluar.`))
      .catch((err) => toast.error(err.message))
    setBusy(false)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <NumberInput
        value={weight2}
        onChange={setWeight2}
        placeholder="Berat keluar (kg)"
        aria-label={`Berat keluar untuk ${weighing.number}`}
        className="w-32"
      />
      <span className={`w-28 text-sm tabular-nums ${warnings.length ? "text-amber-600" : "text-muted-foreground"}`}>
        {net == null ? "Neto —" : `Neto ${formatNumber(net)} kg`}
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button size="icon-sm" variant="ghost" className={iconHover} aria-label={`Aksi untuk ${weighing.number}`} />}>
          <MoreHorizontalIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={submit} disabled={busy || weight2 == null}>
            <ScaleIcon />
            Timbang keluar
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onEdit}>
            <PencilIcon />
            Ubah
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={onCancel}>
            <XCircleIcon />
            Batalkan
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function CancelDialog({ weighing, onClose }: { weighing: Weighing | null; onClose: () => void }) {
  const [reason, setReason] = useState("")
  const [error, setError] = useState<string | null>(null)

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      await cancelWeighing(weighing!.id, reason.trim())
      toast.success(`Timbangan ${weighing!.number} dibatalkan.`)
      setReason("")
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <Dialog open={weighing !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Batalkan {weighing?.number}?</DialogTitle>
          </DialogHeader>
          <Field className="my-6">
            <FieldLabel htmlFor="reason">Alasan</FieldLabel>
            <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} required />
            {error && <FieldError>{error}</FieldError>}
          </Field>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>Kembali</DialogClose>
            <Button type="submit" variant="destructive">
              Batalkan timbangan
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
