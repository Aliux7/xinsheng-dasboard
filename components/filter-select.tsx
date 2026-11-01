"use client"

import { SimpleSelect } from "@/components/simple-select"

type Props = {
  id: string
  /** "" = everything. */
  value: string
  onChange: (value: string) => void
  rows: { code: string; name: string }[]
  /** e.g. "Semua pemasok" */
  allLabel: string
}

/** "All / one of these" dropdown for history filters. */
export function FilterSelect({ id, value, onChange, rows, allLabel }: Props) {
  return (
    <div className="w-full sm:w-56">
      <SimpleSelect
        id={id}
        value={value || "*"}
        onChange={(v) => onChange(v === "*" ? "" : v)}
        options={[{ value: "*", label: allLabel }, ...rows.map((r) => ({ value: r.code, label: `${r.code} · ${r.name}` }))]}
      />
    </div>
  )
}
