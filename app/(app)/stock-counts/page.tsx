"use client"

import { useState } from "react"
import { CheckIcon, PlusIcon, XIcon } from "lucide-react"
import { toast } from "sonner"

import { useIsAdmin } from "@/components/auth-provider"
import { DataTable, type Column } from "@/components/data-table"
import { MonthPicker, useMonth } from "@/components/month-picker"
import { NumberInput } from "@/components/number-input"
import { SimpleSelect } from "@/components/simple-select"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useCollection } from "@/hooks/use-collection"
import { COUNT_STATUS, MATERIALS, STOCK_COUNTS, type Material, type StockCount } from "@/lib/collections"
import { APPROVAL_KG, APPROVAL_PCT, approveCount, needsApproval, rejectCount, saveCount } from "@/lib/stock-count"
import { round3 } from "@/lib/stock"
import { formatDay, formatNumber, today } from "@/lib/utils"

const statusVariant = { pending: "secondary", posted: "outline", rejected: "destructive" } as const
const signed = (n: number) => (n > 0 ? "+" : "") + formatNumber(n)

export default function StockCountsPage() {
  const isAdmin = useIsAdmin()
  const materials = useCollection<Material>(MATERIALS).data
  const { month, setMonth, where, skip } = useMonth()
  const counts = useCollection<StockCount>(STOCK_COUNTS, { where, skip })
  const pending = useCollection<StockCount>(STOCK_COUNTS, { where: [["status", "==", "pending"]] })
  const [creating, setCreating] = useState(false)

  const name = (code: string) => materials.find((m) => m.code === code)?.name ?? ""
  // Waiting counts from any month stay on top until an Admin decides.
  const rows = [...pending.data, ...counts.data.filter((c) => c.status !== "pending")]

  const columns: Column<StockCount>[] = [
    { header: "No. dokumen", cell: (c) => <span className="font-medium">{c.number}</span> },
    { header: "Tanggal", cell: (c) => formatDay(c.date) },
    { header: "Bahan", cell: (c) => <span className="whitespace-normal">{c.material} {name(c.material)}</span> },
    { header: "Sistem", cell: (c) => formatNumber(c.systemBalance), className: "text-right tabular-nums hidden md:table-cell" },
    { header: "Hitung", cell: (c) => formatNumber(c.counted), className: "text-right tabular-nums hidden md:table-cell" },
    { header: "Selisih (kg)", cell: (c) => signed(c.difference), className: "text-right font-medium tabular-nums" },
    {
      header: "Status",
      cell: (c) => (
        <Badge variant={statusVariant[c.status]} title={c.rejectReason || c.reason}>
          {COUNT_STATUS[c.status]}
        </Badge>
      ),
    },
    {
      header: "Disetujui oleh",
      cell: (c) =>
        c.status === "pending" ? (
          isAdmin ? <Decide count={c} /> : <span className="text-muted-foreground">Menunggu Admin</span>
        ) : (
          c.approvedBy?.email ?? <span className="text-muted-foreground">Otomatis</span>
        ),
    },
  ]

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <MonthPicker month={month} setMonth={setMonth} />
        <Button className="ml-auto" onClick={() => setCreating(true)}>
          <PlusIcon />
          Hitung stok
        </Button>
      </div>
      <DataTable
        columns={columns}
        {...counts}
        data={rows.sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number))}
        empty="Belum ada stok opname di bulan ini."
      />
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>{creating && <CountForm materials={materials} onDone={() => setCreating(false)} />}</DialogContent>
      </Dialog>
    </>
  )
}

/** Admin approve / reject buttons on a waiting count. */
function Decide({ count }: { count: StockCount }) {
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
      <Button
        size="icon-sm"
        variant="ghost"
        className="hover:bg-primary hover:text-primary-foreground"
        disabled={busy}
        onClick={() => run(() => approveCount(count.id), `Opname ${count.number} disetujui.`)}
        aria-label="Setujui"
        title="Setujui"
      >
        <CheckIcon />
      </Button>
      <Button
        size="icon-sm"
        variant="ghost"
        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        disabled={busy}
        onClick={() => {
          const reason = prompt(`Alasan menolak ${count.number}?`)
          if (reason?.trim()) run(() => rejectCount(count.id, reason.trim()), `Opname ${count.number} ditolak.`)
        }}
        aria-label="Tolak"
        title="Tolak"
      >
        <XIcon />
      </Button>
    </div>
  )
}

function CountForm({ materials, onDone }: { materials: Material[]; onDone: () => void }) {
  const isAdmin = useIsAdmin()
  const [date, setDate] = useState(today)
  const [material, setMaterial] = useState("")
  const [counted, setCounted] = useState<number | null>(null)
  const [reason, setReason] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const system = materials.find((m) => m.code === material)?.stock ?? 0
  const difference = counted == null ? null : round3(counted - system)
  const big = difference != null && needsApproval(difference, system)

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSaving(true)
    try {
      const saved = await saveCount({ date, material, counted: counted ?? 0, reason: reason.trim() }, isAdmin)
      if (saved.status === "pending") toast.info(`${saved.number} menunggu persetujuan Admin; stok belum berubah.`)
      else toast.success(`Opname ${saved.number} disimpan.`)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit}>
      <DialogHeader>
        <DialogTitle>Stok opname</DialogTitle>
      </DialogHeader>
      <FieldGroup className="my-6">
        <Field>
          <FieldLabel htmlFor="date">Tanggal</FieldLabel>
          <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" required />
        </Field>
        <Field>
          <FieldLabel htmlFor="material">Bahan baku</FieldLabel>
          <SimpleSelect
            id="material"
            value={material}
            onChange={setMaterial}
            options={materials.filter((m) => m.active).map((m) => ({ value: m.code, label: `${m.code} · ${m.name}` }))}
            required
          />
        </Field>
        <div className="grid grid-cols-3 gap-4">
          <Field>
            <FieldLabel>Saldo sistem</FieldLabel>
            <div className="flex h-8 items-center font-medium tabular-nums">{material ? `${formatNumber(system)} kg` : "—"}</div>
          </Field>
          <Field>
            <FieldLabel htmlFor="counted">Hasil hitung (kg)</FieldLabel>
            <NumberInput id="counted" value={counted} onChange={setCounted} required />
          </Field>
          <Field>
            <FieldLabel>Selisih</FieldLabel>
            <div className={`flex h-8 items-center font-medium tabular-nums ${big ? "text-amber-600" : ""}`}>
              {difference == null ? "—" : `${signed(difference)} kg`}
            </div>
          </Field>
        </div>
        {big && (
          <p className="-mt-3 text-sm text-amber-600">
            {isAdmin
              ? `Selisih di atas ${APPROVAL_PCT}% atau ${APPROVAL_KG} kg — disetujui langsung oleh Anda sebagai Admin.`
              : `Selisih di atas ${APPROVAL_PCT}% atau ${APPROVAL_KG} kg — perlu persetujuan Admin sebelum stok berubah.`}
          </p>
        )}
        <Field>
          <FieldLabel htmlFor="reason">Alasan</FieldLabel>
          <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} required />
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
