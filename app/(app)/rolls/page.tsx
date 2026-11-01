"use client"

import { useState } from "react"
import { toast } from "sonner"

import { DataTable, type Column } from "@/components/data-table"
import { NumberInput } from "@/components/number-input"
import { SimpleSelect } from "@/components/simple-select"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useCollection } from "@/hooks/use-collection"
import { useToday } from "@/hooks/use-today"
import { CLOTH_GRADES, LOOMS, LOOM_DEFAULTS, ROLLS, type ClothGrade, type Loom, type Roll } from "@/lib/collections"
import { gsmOf, offStandard, saveRoll } from "@/lib/rolls"
import { formatNumber } from "@/lib/utils"

type Form = {
  date: string
  grade: string
  machine: string
  kg: number | null
  metres: number | null
  width: number | null
  location: string
  note: string
}

const blank = (date: string): Form => ({
  date,
  grade: "",
  machine: "",
  kg: null,
  metres: null,
  width: LOOM_DEFAULTS.width,
  location: LOOM_DEFAULTS.location,
  note: "",
})

export default function RollsPage() {
  const today = useToday()
  const grades = useCollection<ClothGrade>(CLOTH_GRADES).data
  const machines = useCollection<Loom>(LOOMS).data
  const todays = useCollection<Roll>(ROLLS, { where: [["date", "==", today ?? ""]], skip: !today })
  const gradeOf = (code: string) => grades.find((g) => g.code === code)

  const columns: Column<Roll>[] = [
    { header: "No. roll", cell: (r) => <span className="font-medium">{r.number}</span> },
    { header: "Tipe kain", cell: (r) => gradeOf(r.grade)?.name ?? r.grade },
    { header: "Mesin", cell: (r) => r.machine },
    { header: "Kg", cell: (r) => formatNumber(r.kg), className: "text-right tabular-nums" },
    { header: "Meter", cell: (r) => formatNumber(r.metres), className: "text-right tabular-nums" },
    {
      header: "g/m²",
      cell: (r) => <span className={offStandard(r.gsm, gradeOf(r.grade)) ? "font-medium text-amber-600" : undefined}>{formatNumber(r.gsm)}</span>,
      className: "text-right tabular-nums",
    },
  ]

  return (
    <div className="flex flex-col gap-8">
      {today && <RollForm key={today} today={today} grades={grades} machines={machines} />}
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Roll hari ini</h2>
        <DataTable columns={columns} {...todays} data={[...todays.data].sort((a, b) => b.number - a.number)} empty="Belum ada roll hari ini." />
      </section>
    </div>
  )
}

function RollForm({ today, grades, machines }: { today: string; grades: ClothGrade[]; machines: Loom[] }) {
  const [form, setForm] = useState<Form>(() => blank(today))
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }))

  const grade = grades.find((g) => g.code === form.grade)
  const gsm = gsmOf(form.kg, form.metres, form.width)
  const off = offStandard(gsm, grade)

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!form.kg || !form.metres || !form.width) return setError("Berat, panjang dan lebar harus lebih dari 0.")
    setError(null)
    setSaving(true)
    try {
      const number = await saveRoll({ ...form, kg: form.kg, metres: form.metres, width: form.width, location: form.location.trim(), note: form.note.trim() })
      setSaved(number)
      toast.success(`Roll ${number} disimpan.`)
      // Keep date, grade, machine, width and location for the next roll; clear the measurements.
      set({ kg: null, metres: null, note: "" })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
    setSaving(false)
  }

  return (
    <form onSubmit={submit} className="max-w-3xl rounded-xl border p-4">
      <FieldGroup>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Field>
            <FieldLabel htmlFor="date">Tanggal</FieldLabel>
            <Input id="date" type="date" value={form.date} onChange={(e) => set({ date: e.target.value })} required />
          </Field>
          <Field>
            <FieldLabel htmlFor="grade">Tipe kain</FieldLabel>
            <SimpleSelect
              id="grade"
              value={form.grade}
              onChange={(g) => set({ grade: g })}
              options={grades.filter((g) => g.active).map((g) => ({ value: g.code, label: g.name || g.code }))}
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="machine">Mesin</FieldLabel>
            <SimpleSelect
              id="machine"
              value={form.machine}
              onChange={(machine) => set({ machine })}
              options={machines
                .filter((m) => m.active)
                .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
                .map((m) => ({ value: m.code, label: m.name ? `${m.code} · ${m.name}` : m.code }))}
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="kg">Berat (kg)</FieldLabel>
            <NumberInput id="kg" value={form.kg} onChange={(kg) => set({ kg })} required />
          </Field>
          <Field>
            <FieldLabel htmlFor="metres">Panjang (m)</FieldLabel>
            <NumberInput id="metres" value={form.metres} onChange={(metres) => set({ metres })} required />
          </Field>
          <Field>
            <FieldLabel htmlFor="width">Lebar (m)</FieldLabel>
            <NumberInput id="width" value={form.width} onChange={(width) => set({ width })} required />
          </Field>
        </div>
        <div className={`rounded-lg p-3 text-sm ${off ? "bg-amber-500/10 text-amber-700 dark:text-amber-500" : "bg-muted/50"}`}>
          <span className="text-muted-foreground">Berat per m²: </span>
          <span className="font-semibold tabular-nums">{gsm == null ? "—" : `${formatNumber(gsm)} g/m²`}</span>
          {grade?.weight != null && (
            <span className="ml-3 text-muted-foreground">
              Standar {grade.code}: {formatNumber(grade.weight)} ± {formatNumber(grade.tolerance)} g/m²
            </span>
          )}
          {off && <span className="ml-3 font-medium">⚠ di luar toleransi</span>}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="location">Lokasi</FieldLabel>
            <Input id="location" value={form.location} onChange={(e) => set({ location: e.target.value })} />
          </Field>
          <Field>
            <FieldLabel htmlFor="note">Catatan</FieldLabel>
            <Input id="note" value={form.note} onChange={(e) => set({ note: e.target.value })} />
          </Field>
        </div>
        {error && <FieldError>{error}</FieldError>}
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={saving}>
            {saving ? "Menyimpan…" : "Simpan roll"}
          </Button>
          {saved && <FieldDescription>Roll {saved} tersimpan, status Di stok.</FieldDescription>}
        </div>
      </FieldGroup>
    </form>
  )
}
