"use client"

import { useState } from "react"
import { toast } from "sonner"

import { NumberInput } from "@/components/number-input"
import { SimpleSelect } from "@/components/simple-select"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { Material, Supplier, Weighing } from "@/lib/collections"
import { formatNumber, nowTime, today } from "@/lib/utils"
import { netOf, saveArrival, weightErrors, weightWarnings, type WeighingInput } from "@/lib/weighing"

type Props = {
  /** `null` = closed, `"new"` = truck arrives, a weighing = edit one still on site. */
  weighing: Weighing | "new" | null
  onClose: () => void
  suppliers: Supplier[]
  materials: Material[]
}

const blank = (): WeighingInput => ({
  date: today(),
  plate: "",
  driver: "",
  container: "",
  supplier: "",
  material: "",
  timeIn: nowTime(),
  timeOut: "",
  weight1: 0,
  weight2: null,
  moisture: null,
  notes: "",
})

export function ArrivalDialog({ weighing, onClose, ...lists }: Props) {
  return (
    <Dialog open={weighing !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl">
        {weighing && (
          <ArrivalForm
            key={weighing === "new" ? "new" : weighing.id}
            weighing={weighing === "new" ? null : weighing}
            onDone={onClose}
            {...lists}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function ArrivalForm({
  weighing,
  onDone,
  suppliers,
  materials,
}: Omit<Props, "weighing" | "onClose"> & { weighing: Weighing | null; onDone: () => void }) {
  const [form, setForm] = useState<WeighingInput>(() => {
    if (!weighing) return blank()
    const { date, plate, driver, container, supplier, material, timeIn, timeOut, weight1, weight2, moisture, notes } = weighing
    return { date, plate, driver, container, supplier, material, timeIn, timeOut, weight1, weight2, moisture, notes }
  })
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const set = (patch: Partial<WeighingInput>) => setForm((f) => ({ ...f, ...patch }))

  const net = netOf(form.weight1, form.weight2)
  const warnings = weightWarnings(form.weight1, form.weight2)
  const pick = <T extends { code: string; name: string; active: boolean }>(rows: T[], current: string) =>
    rows.filter((r) => r.active || r.code === current).map((r) => ({ value: r.code, label: `${r.code} · ${r.name}` }))

  async function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const problem = weightErrors(form.weight1, form.weight2)
    if (problem) return setError(problem)
    if (warnings.length && !confirm(`${warnings.join("\n")}\n\nTetap simpan?`)) return
    setError(null)
    setSaving(true)
    try {
      const plate = form.plate.trim().toUpperCase()
      await saveArrival({ ...form, plate }, weighing?.id)
      toast.success(weighing ? `Timbangan ${weighing.number} diperbarui.` : `Kedatangan truk ${plate} disimpan.`)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>{weighing ? `Ubah ${weighing.number}` : "Truk masuk"}</DialogTitle>
      </DialogHeader>
      <FieldGroup className="my-6">
        <div className="grid grid-cols-2 gap-4">
          <Field>
            <FieldLabel htmlFor="date">Tanggal</FieldLabel>
            <Input id="date" type="date" value={form.date} onChange={(e) => set({ date: e.target.value })} required />
          </Field>
          <Field>
            <FieldLabel htmlFor="timeIn">Jam masuk</FieldLabel>
            <Input id="timeIn" type="time" value={form.timeIn} onChange={(e) => set({ timeIn: e.target.value })} required />
          </Field>
          <Field>
            <FieldLabel htmlFor="plate">No. polisi</FieldLabel>
            <Input id="plate" value={form.plate} onChange={(e) => set({ plate: e.target.value })} placeholder="B 1234 XYZ" required />
          </Field>
          <Field>
            <FieldLabel htmlFor="driver">Sopir</FieldLabel>
            <Input id="driver" value={form.driver} onChange={(e) => set({ driver: e.target.value })} />
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="container">Kode kontainer</FieldLabel>
          <Input id="container" value={form.container} onChange={(e) => set({ container: e.target.value })} />
        </Field>
        <Field>
          <FieldLabel htmlFor="supplier">Pemasok</FieldLabel>
          <SimpleSelect id="supplier" value={form.supplier} onChange={(supplier) => set({ supplier })} options={pick(suppliers, form.supplier)} required />
        </Field>
        <Field>
          <FieldLabel htmlFor="material">Bahan baku</FieldLabel>
          <SimpleSelect id="material" value={form.material} onChange={(material) => set({ material })} options={pick(materials, form.material)} required />
        </Field>
        <div className="grid grid-cols-3 gap-4">
          <Field>
            <FieldLabel htmlFor="weight1">Berat masuk (kg)</FieldLabel>
            <NumberInput id="weight1" value={form.weight1 || null} onChange={(v) => set({ weight1: v ?? 0 })} required />
          </Field>
          <Field>
            <FieldLabel htmlFor="weight2">Berat keluar (kg)</FieldLabel>
            <NumberInput id="weight2" value={form.weight2} onChange={(weight2) => set({ weight2 })} />
          </Field>
          <Field>
            <FieldLabel htmlFor="moisture">Kadar air %</FieldLabel>
            <NumberInput id="moisture" value={form.moisture} onChange={(moisture) => set({ moisture })} max={100} />
          </Field>
        </div>
        <FieldDescription className="-mt-3">
          {net == null
            ? "Isi berat keluar nanti saat truk keluar, atau sekarang bila sudah diketahui."
            : `Neto: ${formatNumber(net)} kg — langsung masuk stok saat disimpan.`}
        </FieldDescription>
        {warnings.map((w) => (
          <p key={w} className="-mt-3 text-sm text-amber-600">
            ⚠ {w}
          </p>
        ))}
        <Field>
          <FieldLabel htmlFor="notes">Catatan</FieldLabel>
          <Textarea id="notes" value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
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
