"use client"

import { useState } from "react"
import { PackageMinusIcon } from "lucide-react"
import { toast } from "sonner"

import { DataTable, type Column } from "@/components/data-table"
import { FilterSelect } from "@/components/filter-select"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useCollection } from "@/hooks/use-collection"
import { CLOTH_GRADES, LOOM_DEFAULTS, ROLLS, ROLL_STATUS, type ClothGrade, type Roll } from "@/lib/collections"
import { issueRolls, offStandard } from "@/lib/rolls"
import { round3 } from "@/lib/stock"
import { formatDay, formatNumber, today } from "@/lib/utils"

export default function ClothStockPage() {
  const rolls = useCollection<Roll>(ROLLS)
  const grades = useCollection<ClothGrade>(CLOTH_GRADES).data
  const [status, setStatus] = useState("instock")
  const [grade, setGrade] = useState("")
  const [month, setMonth] = useState("")
  const [machine, setMachine] = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [issuing, setIssuing] = useState(false)

  const gradeOf = (code: string) => grades.find((g) => g.code === code)
  const inStock = rolls.data.filter((r) => r.status === "instock")
  const shown = rolls.data
    .filter(
      (r) =>
        (!status || r.status === status) &&
        (!grade || r.grade === grade) &&
        (!month || r.date.startsWith(month)) &&
        (!machine || r.machine === machine)
    )
    .sort((a, b) => b.number - a.number)
  // Only rolls still in stock and still visible can be selected.
  const picked = shown.filter((r) => r.status === "instock" && selected.has(r.id))

  const toggle = (id: string, on: boolean) =>
    setSelected((s) => {
      const next = new Set(s)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })

  const cards = [...new Set(inStock.map((r) => r.grade))].sort().map((code) => {
    const these = inStock.filter((r) => r.grade === code)
    return {
      code,
      name: gradeOf(code)?.name ?? code,
      rolls: these.length,
      kg: round3(these.reduce((s, r) => s + r.kg, 0)),
      metres: round3(these.reduce((s, r) => s + r.metres, 0)),
      machines: new Set(these.map((r) => r.machine)).size,
    }
  })

  const selectable = shown.filter((r) => r.status === "instock")
  const columns: Column<Roll>[] = [
    {
      header: "",
      className: "w-8",
      cell: (r) =>
        r.status === "instock" && (
          <Checkbox checked={selected.has(r.id)} onCheckedChange={(on) => toggle(r.id, on)} aria-label={`Pilih roll ${r.number}`} />
        ),
    },
    { header: "No. roll", cell: (r) => <span className="font-medium">{r.number}</span> },
    { header: "Tanggal", cell: (r) => formatDay(r.date) },
    { header: "Tipe kain", cell: (r) => gradeOf(r.grade)?.name ?? r.grade },
    { header: "Mesin", cell: (r) => r.machine },
    { header: "Kg", cell: (r) => formatNumber(r.kg), className: "text-right tabular-nums" },
    { header: "Meter", cell: (r) => formatNumber(r.metres), className: "text-right tabular-nums" },
    {
      header: "g/m²",
      cell: (r) => <span className={offStandard(r.gsm, gradeOf(r.grade)) ? "font-medium text-amber-600" : undefined}>{formatNumber(r.gsm)}</span>,
      className: "text-right tabular-nums",
    },
    {
      header: "Status",
      cell: (r) => (
        <Badge variant={r.status === "instock" ? "outline" : "secondary"} title={r.issueDate ? `${formatDay(r.issueDate)} → ${r.destination}` : undefined}>
          {ROLL_STATUS[r.status]}
        </Badge>
      ),
    },
  ]

  const machineRows = [...new Set(rolls.data.map((r) => r.machine))]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((code) => ({ code, name: `Mesin ${code}` }))
  const months = [...new Set(rolls.data.map((r) => r.date.slice(0, 7)))].sort().reverse().map((m) => ({ code: m, name: m }))

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.code} className="rounded-xl border p-4">
            <div className="font-medium">{c.name}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{c.rolls} roll</div>
            <div className="text-sm text-muted-foreground tabular-nums">
              {formatNumber(c.kg)} kg · {formatNumber(c.metres)} m
            </div>
            <div className="text-xs text-muted-foreground">dari {c.machines} mesin</div>
          </div>
        ))}
        {!rolls.loading && !cards.length && <p className="text-sm text-muted-foreground">Tidak ada roll di stok.</p>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <FilterSelect
          id="filter-status"
          value={status}
          onChange={setStatus}
          rows={Object.entries(ROLL_STATUS).map(([code, name]) => ({ code, name }))}
          allLabel="Semua status"
        />
        <FilterSelect id="filter-grade" value={grade} onChange={setGrade} rows={grades} allLabel="Semua tipe kain" />
        <FilterSelect id="filter-month" value={month} onChange={setMonth} rows={months} allLabel="Semua bulan" />
        <FilterSelect id="filter-machine" value={machine} onChange={setMachine} rows={machineRows} allLabel="Semua mesin" />
        <div className="ml-auto flex items-center gap-2">
          {selectable.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelected(picked.length === selectable.length ? new Set() : new Set(selectable.map((r) => r.id)))}
            >
              {picked.length === selectable.length ? "Batal pilih" : "Pilih semua"}
            </Button>
          )}
          <Button onClick={() => setIssuing(true)} disabled={!picked.length}>
            <PackageMinusIcon />
            Keluarkan{picked.length ? ` (${picked.length})` : ""}
          </Button>
        </div>
      </div>

      <DataTable columns={columns} {...rolls} data={shown} empty="Tidak ada roll yang cocok." />

      <Dialog open={issuing} onOpenChange={setIssuing}>
        <DialogContent>
          {issuing && (
            <IssueForm
              rolls={picked}
              onDone={() => {
                setIssuing(false)
                setSelected(new Set())
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function IssueForm({ rolls, onDone }: { rolls: Roll[]; onDone: () => void }) {
  const [date, setDate] = useState(today)
  const [destination, setDestination] = useState(LOOM_DEFAULTS.destination)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    try {
      await issueRolls(rolls.map((r) => r.id), date, destination.trim())
      toast.success(`${rolls.length} roll dikeluarkan.`)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit}>
      <DialogHeader>
        <DialogTitle>Keluarkan {rolls.length} roll</DialogTitle>
      </DialogHeader>
      <p className="mt-2 text-sm text-muted-foreground">
        {rolls.map((r) => r.number).join(", ")} — {formatNumber(round3(rolls.reduce((s, r) => s + r.kg, 0)))} kg
      </p>
      <FieldGroup className="my-6">
        <div className="grid grid-cols-2 gap-4">
          <Field>
            <FieldLabel htmlFor="issueDate">Tanggal keluar</FieldLabel>
            <Input id="issueDate" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </Field>
          <Field>
            <FieldLabel htmlFor="destination">Tujuan</FieldLabel>
            <Input id="destination" value={destination} onChange={(e) => setDestination(e.target.value)} required />
          </Field>
        </div>
        {error && <FieldError>{error}</FieldError>}
      </FieldGroup>
      <DialogFooter>
        <DialogClose render={<Button variant="outline" type="button" />}>Batal</DialogClose>
        <Button type="submit" disabled={saving}>
          {saving ? "Menyimpan…" : "Keluarkan"}
        </Button>
      </DialogFooter>
    </form>
  )
}
