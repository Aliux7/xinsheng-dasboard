"use client"

import { PlusIcon, Trash2Icon } from "lucide-react"

import { NumberInput } from "@/components/number-input"
import { SimpleSelect } from "@/components/simple-select"
import { Button } from "@/components/ui/button"
import type { Material } from "@/lib/collections"
import { formatNumber } from "@/lib/utils"

export type Line = { material: string; qty: number | null }

type Props = {
  lines: Line[]
  onChange: (lines: Line[]) => void
  /** Materials to choose from; each option shows its current stock. */
  materials: Material[]
  label?: string
}

/** Editable list of "material + kg" rows, used by every page that takes stock out. */
export function MaterialLines({ lines, onChange, materials, label = "Bahan" }: Props) {
  const update = (i: number, patch: Partial<Line>) => onChange(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)))
  const options = (current: string) =>
    materials
      .filter((m) => m.active || m.code === current)
      .map((m) => ({ value: m.code, label: `${m.code} · ${m.name} — stok ${formatNumber(m.stock ?? 0)} ${m.unit}` }))

  return (
    <div className="flex flex-col gap-2">
      {lines.map((line, i) => (
        <div key={i} className="grid grid-cols-[1fr_8rem_auto] items-center gap-2">
          <SimpleSelect
            id={`line-${i}`}
            value={line.material}
            onChange={(material) => update(i, { material })}
            options={options(line.material)}
            placeholder={`Pilih ${label.toLowerCase()}`}
            required
          />
          <NumberInput
            value={line.qty}
            onChange={(qty) => update(i, { qty })}
            placeholder="kg"
            aria-label={`Kg baris ${i + 1}`}
            required
          />
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            onClick={() => onChange(lines.filter((_, j) => j !== i))}
            disabled={lines.length === 1}
            aria-label="Hapus baris"
            title="Hapus baris"
          >
            <Trash2Icon />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => onChange([...lines, { material: "", qty: null }])}>
        <PlusIcon />
        Tambah {label.toLowerCase()}
      </Button>
    </div>
  )
}
