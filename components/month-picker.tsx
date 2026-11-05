"use client"

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

/** "2026-01" + -1 → "2025-12" */
export function shiftMonth(month: string, by: number) {
  const [y, m] = month.split("-").map(Number)
  const total = y * 12 + (m - 1) + by
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`
}

/** Month (YYYY-MM) with previous / next buttons around it. */
export function MonthPicker({ month, onChange }: { month: string; onChange: (month: string) => void }) {
  return (
    <div className="flex items-center gap-1">
      <Button type="button" size="icon" variant="outline" onClick={() => onChange(shiftMonth(month, -1))} disabled={!month} aria-label="Bulan sebelumnya" title="Bulan sebelumnya">
        <ChevronLeftIcon />
      </Button>
      <Input type="month" className="w-40" value={month} onChange={(e) => onChange(e.target.value)} aria-label="Bulan" />
      <Button type="button" size="icon" variant="outline" onClick={() => onChange(shiftMonth(month, 1))} disabled={!month} aria-label="Bulan berikutnya" title="Bulan berikutnya">
        <ChevronRightIcon />
      </Button>
    </div>
  )
}
