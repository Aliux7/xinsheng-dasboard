"use client"

import { useState } from "react"

import { NumberInput } from "@/components/number-input"
import { Field, FieldLabel } from "@/components/ui/field"
import { useToday } from "@/hooks/use-today"

/** Year picker starting on the current year (0 until known in the browser). */
export function useYear() {
  const thisYear = Number(useToday()?.slice(0, 4) ?? 0)
  const [picked, setYear] = useState<number | null>(null)
  return { year: picked ?? thisYear, setYear }
}

export function YearField({ year, setYear }: { year: number; setYear: (y: number) => void }) {
  return (
    <Field className="w-28">
      <FieldLabel htmlFor="year">Tahun</FieldLabel>
      <NumberInput id="year" value={year || null} onChange={(y) => y && setYear(y)} step={1} plain />
    </Field>
  )
}
