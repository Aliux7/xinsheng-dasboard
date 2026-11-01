"use client"

import { useState } from "react"

import { Input } from "@/components/ui/input"
import { useToday } from "@/hooks/use-today"
import { monthRange } from "@/lib/utils"

/**
 * Month filter for history lists. Starts on this month; `where` is the date-range
 * filter for `useCollection`, and `skip` is true until the month is known.
 */
export function useMonth() {
  const thisMonth = useToday()?.slice(0, 7) ?? ""
  const [picked, setMonth] = useState("")
  const month = picked || thisMonth
  const [from, to] = month ? monthRange(month) : ["", ""]
  return {
    month,
    setMonth,
    skip: !month,
    where: [["date", ">=", from], ["date", "<", to]] as [string, ">=" | "<", string][],
  }
}

export function MonthPicker({ month, setMonth }: { month: string; setMonth: (m: string) => void }) {
  return (
    <Input
      type="month"
      value={month}
      onChange={(e) => e.target.value && setMonth(e.target.value)}
      className="w-full sm:w-44"
      aria-label="Bulan"
    />
  )
}
