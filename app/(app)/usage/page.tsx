"use client"

import { useState } from "react"
import { PlusIcon } from "lucide-react"
import { toast } from "sonner"

import { DataTable, type Column } from "@/components/data-table"
import { FilterSelect } from "@/components/filter-select"
import { MaterialLines, type Line } from "@/components/material-lines"
import { MonthPicker, useMonth } from "@/components/month-picker"
import { SimpleSelect } from "@/components/simple-select"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { useCollection } from "@/hooks/use-collection"
import { DEPARTMENTS, MATERIALS, SHIFTS, USAGES, type Department, type Material, type Usage } from "@/lib/collections"
import { mergeInputs } from "@/lib/processing"
import { stockErrors } from "@/lib/stock"
import { saveUsage } from "@/lib/usage"
import { formatDay, formatNumber, today } from "@/lib/utils"

// Note: in the Excel log, dirty material sent to the washing area is also recorded here (department Extruder).
export default function UsagePage() {
  const materials = useCollection<Material>(MATERIALS).data
  const departments = useCollection<Department>(DEPARTMENTS).data
  const { month, setMonth, where, skip } = useMonth()
  const history = useCollection<Usage>(USAGES, { where, skip })
  const [department, setDepartment] = useState("")
  const [material, setMaterial] = useState("")
  const [creating, setCreating] = useState(false)

  const name = (rows: { code: string; name: string }[], code: string) => rows.find((r) => r.code === code)?.name ?? code

  const columns: Column<Usage>[] = [
    { header: "No. dokumen", cell: (u) => <span className="font-medium">{u.number}</span> },
    { header: "Tanggal", cell: (u) => formatDay(u.date) },
    { header: "Shift", cell: (u) => u.shift },
    { header: "Departemen", cell: (u) => name(departments, u.department), className: "hidden md:table-cell" },
    {
      header: "Bahan",
      cell: (u) => (
        <ul className="text-xs whitespace-normal">
          {u.lines.map((l) => (
            <li key={l.material}>
              {l.material} {name(materials, l.material)} — {formatNumber(l.qty)} kg
            </li>
          ))}
        </ul>
      ),
    },
    { header: "Total", cell: (u) => `${formatNumber(u.total)} kg`, className: "text-right tabular-nums" },
  ]

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <MonthPicker month={month} setMonth={setMonth} />
        <FilterSelect id="filter-department" value={department} onChange={setDepartment} rows={departments} allLabel="Semua departemen" />
        <FilterSelect id="filter-material" value={material} onChange={setMaterial} rows={materials} allLabel="Semua bahan" />
        <Button className="ml-auto" onClick={() => setCreating(true)}>
          <PlusIcon />
          Pemakaian baru
        </Button>
      </div>
      <DataTable
        columns={columns}
        {...history}
        data={history.data
          .filter((u) => (!department || u.department === department) && (!material || u.lines.some((l) => l.material === material)))
          .sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number))}
        empty="Belum ada pemakaian di bulan ini."
      />
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="sm:max-w-2xl">
          {creating && <UsageForm materials={materials} departments={departments} onDone={() => setCreating(false)} />}
        </DialogContent>
      </Dialog>
    </>
  )
}

function UsageForm({ materials, departments, onDone }: { materials: Material[]; departments: Department[]; onDone: () => void }) {
  const [date, setDate] = useState(today)
  const [shift, setShift] = useState<Usage["shift"] | "">("")
  const [department, setDepartment] = useState("")
  const [onlyDepartment, setOnlyDepartment] = useState(true)
  const [lines, setLines] = useState<Line[]>([{ material: "", qty: null }])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const merged = mergeInputs(lines)
  const total = merged.reduce((sum, l) => sum + l.qty, 0)
  const errors = stockErrors(merged, materials)
  const choices = onlyDepartment && department ? materials.filter((m) => m.department === department) : materials
  const repeated = lines.filter((l) => l.material).length !== new Set(lines.map((l) => l.material).filter(Boolean)).size

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (errors.length) return setError(errors[0])
    setError(null)
    setSaving(true)
    try {
      const number = await saveUsage({ date, shift: shift as Usage["shift"], department, lines })
      toast.success(`Pemakaian ${number} disimpan.`)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit}>
      <DialogHeader>
        <DialogTitle>Pemakaian bahan</DialogTitle>
      </DialogHeader>
      <FieldGroup className="my-6">
        <div className="grid grid-cols-3 gap-4">
          <Field>
            <FieldLabel htmlFor="date">Tanggal</FieldLabel>
            <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </Field>
          <Field>
            <FieldLabel htmlFor="shift">Shift</FieldLabel>
            <SimpleSelect id="shift" value={shift} onChange={(v) => setShift(v as Usage["shift"])} options={SHIFTS.map((s) => ({ value: s, label: s }))} required />
          </Field>
          <Field>
            <FieldLabel htmlFor="department">Departemen</FieldLabel>
            <SimpleSelect
              id="department"
              value={department}
              onChange={setDepartment}
              options={departments.filter((d) => d.active).map((d) => ({ value: d.code, label: d.name || d.code }))}
              required
            />
          </Field>
        </div>
        <Field>
          <FieldLabel>Bahan</FieldLabel>
          <MaterialLines lines={lines} onChange={setLines} materials={choices} />
        </Field>
        <Field orientation="horizontal">
          <Switch id="onlyDepartment" checked={onlyDepartment} onCheckedChange={setOnlyDepartment} />
          <FieldLabel htmlFor="onlyDepartment">Hanya bahan departemen ini</FieldLabel>
        </Field>
        <div className="rounded-lg bg-muted/50 p-3 text-sm">
          <span className="text-muted-foreground">Total: </span>
          <span className="font-semibold tabular-nums">{formatNumber(total)} kg</span>
          {repeated && <span className="ml-2 text-muted-foreground">(bahan yang sama digabung)</span>}
        </div>
        {(error || errors.length > 0) && <FieldError>{error ?? errors.join(" ")}</FieldError>}
      </FieldGroup>
      <DialogFooter>
        <DialogClose render={<Button variant="outline" type="button" />}>Batal</DialogClose>
        <Button type="submit" disabled={saving || errors.length > 0}>
          {saving ? "Menyimpan…" : "Simpan"}
        </Button>
      </DialogFooter>
    </form>
  )
}
