"use client"

import { useState } from "react"
import { DropletsIcon, RecycleIcon } from "lucide-react"
import { toast } from "sonner"

import { DataTable, type Column } from "@/components/data-table"
import { MaterialLines, type Line } from "@/components/material-lines"
import { MonthPicker, useMonth } from "@/components/month-picker"
import { NumberInput } from "@/components/number-input"
import { SimpleSelect } from "@/components/simple-select"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useCollection } from "@/hooks/use-collection"
import { MATERIALS, PROCESSINGS, PROCESS_TYPES, type Material, type ProcessType, type Processing } from "@/lib/collections"
import { mergeInputs, processingErrors, saveProcessing, shrinkageOf } from "@/lib/processing"
import { formatDay, formatNumber, today } from "@/lib/utils"

export default function ProcessingsPage() {
  const materials = useCollection<Material>(MATERIALS).data
  const { month, setMonth, where, skip } = useMonth()
  const history = useCollection<Processing>(PROCESSINGS, { where, skip })
  const [creating, setCreating] = useState<ProcessType | null>(null)

  const label = (code: string) => `${code} ${materials.find((m) => m.code === code)?.name ?? ""}`

  const columns: Column<Processing>[] = [
    {
      header: "No. dokumen",
      cell: (p) => (
        <span className="flex items-center gap-2 font-medium">
          {p.number}
          <Badge variant="outline">{PROCESS_TYPES[p.type]}</Badge>
        </span>
      ),
    },
    { header: "Tanggal", cell: (p) => formatDay(p.date) },
    {
      header: "Input",
      cell: (p) => (
        <ul className="text-xs whitespace-normal">
          {p.inputs.map((i) => (
            <li key={i.material}>
              {label(i.material)} — {formatNumber(i.qty)} kg
            </li>
          ))}
        </ul>
      ),
    },
    {
      header: "Output",
      cell: (p) => (
        <span className="text-xs whitespace-normal">
          {label(p.output)} — {formatNumber(p.cleanWeight)} kg
        </span>
      ),
      className: "hidden md:table-cell",
    },
    { header: "Susut", cell: (p) => `${formatNumber(p.shrinkage)} kg`, className: "text-right tabular-nums" },
    { header: "Susut %", cell: (p) => `${formatNumber(p.shrinkagePct)}%`, className: "text-right tabular-nums" },
  ]

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <MonthPicker month={month} setMonth={setMonth} />
        <div className="ml-auto flex gap-2">
          <Button onClick={() => setCreating("wash")}>
            <DropletsIcon />
            Cuci
          </Button>
          <Button onClick={() => setCreating("recycle")}>
            <RecycleIcon />
            Recycle
          </Button>
        </div>
      </div>
      <DataTable
        columns={columns}
        {...history}
        data={[...history.data].sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number))}
        empty="Belum ada cuci atau recycle di bulan ini."
      />
      <Dialog open={creating !== null} onOpenChange={(open) => !open && setCreating(null)}>
        <DialogContent className="sm:max-w-2xl">
          {creating && <ProcessingForm key={creating} type={creating} materials={materials} onDone={() => setCreating(null)} />}
        </DialogContent>
      </Dialog>
    </>
  )
}

function ProcessingForm({ type, materials, onDone }: { type: ProcessType; materials: Material[]; onDone: () => void }) {
  const [date, setDate] = useState(today)
  const [lines, setLines] = useState<Line[]>([{ material: "", qty: null }])
  const [picked, setOutput] = useState("")
  const [wetWeight, setWetWeight] = useState<number | null>(null)
  const [cleanWeight, setCleanWeight] = useState<number | null>(null)
  const [reason, setReason] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const isWash = type === "wash"
  const inputs = mergeInputs(lines)
  const total = inputs.reduce((sum, i) => sum + i.qty, 0)
  const shrinkage = shrinkageOf(total, cleanWeight)
  const errors = processingErrors(inputs, cleanWeight, materials)

  // Washing: inputs are Dirty materials and the output defaults to their Clean partner.
  const inputChoices = isWash ? materials.filter((m) => m.condition === "dirty") : materials
  const pairs = [...new Set(inputs.map((i) => materials.find((m) => m.code === i.material)?.cleanTo).filter(Boolean))]
  const suggested = isWash && pairs.length === 1 ? pairs[0]! : ""
  const output = picked || suggested
  const wanted = isWash ? "clean" : "recycled"
  const outputChoices = materials.filter((m) => m.active && !inputs.some((i) => i.material === m.code))
  const preferred = outputChoices.filter((m) => m.condition === wanted)

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (errors.length) return setError(errors[0])
    setError(null)
    setSaving(true)
    try {
      const number = await saveProcessing({ type, date, inputs, output, wetWeight, cleanWeight: cleanWeight ?? 0, reason: reason.trim() })
      toast.success(`${isWash ? "Pencucian" : "Recycle"} ${number} disimpan.`)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit}>
      <DialogHeader>
        <DialogTitle>{isWash ? "Cuci bahan kotor" : "Recycle menjadi pelet"}</DialogTitle>
      </DialogHeader>
      <FieldGroup className="my-6">
        <Field>
          <FieldLabel htmlFor="date">Tanggal</FieldLabel>
          <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" required />
        </Field>
        <Field>
          <FieldLabel>Bahan input</FieldLabel>
          <MaterialLines lines={lines} onChange={setLines} materials={inputChoices} />
          {isWash && !inputChoices.length && (
            <FieldDescription>Belum ada bahan dengan kondisi Kotor di Bahan baku gudang.</FieldDescription>
          )}
        </Field>
        <Field>
          <FieldLabel htmlFor="output">Bahan output</FieldLabel>
          <SimpleSelect
            id="output"
            value={output}
            onChange={setOutput}
            options={(preferred.length ? preferred : outputChoices).map((m) => ({ value: m.code, label: `${m.code} · ${m.name}` }))}
            required
          />
          {isWash && suggested && !picked && <FieldDescription>Disarankan dari pasangan kotor → bersih.</FieldDescription>}
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field>
            <FieldLabel htmlFor="wetWeight">Berat basah (kg)</FieldLabel>
            <NumberInput id="wetWeight" value={wetWeight} onChange={setWetWeight} />
          </Field>
          <Field>
            <FieldLabel htmlFor="cleanWeight">Berat bersih (kg)</FieldLabel>
            <NumberInput id="cleanWeight" value={cleanWeight} onChange={setCleanWeight} required />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-4 rounded-lg bg-muted/50 p-3 text-sm">
          <div>
            <div className="text-muted-foreground">Total input</div>
            <div className="font-semibold tabular-nums">{formatNumber(total)} kg</div>
          </div>
          <div>
            <div className="text-muted-foreground">Susut</div>
            <div className="font-semibold tabular-nums">{shrinkage ? `${formatNumber(shrinkage.kg)} kg` : "—"}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Susut %</div>
            <div className="font-semibold tabular-nums">{shrinkage ? `${formatNumber(shrinkage.pct)}%` : "—"}</div>
          </div>
        </div>
        <Field>
          <FieldLabel htmlFor="reason">Alasan susut</FieldLabel>
          <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
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
