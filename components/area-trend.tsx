"use client"

import { useId } from "react"
import { Area, AreaChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from "recharts"

import { lighter, NEGATIVE, POSITIVE } from "@/components/chart-tone"
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"

const compact = new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 })

/**
 * Area chart in the shadcn style. `data` rows hold `label` (x axis) plus one number per key of
 * `series` (key → legend label). Above zero the fill is a green gradient, boldest at the highest
 * values; below zero it turns red, boldest at the lowest. A second series is a paler, dashed green.
 */
export function AreaTrend({ data, series }: { data: Record<string, string | number>[]; series: Record<string, string> }) {
  const id = useId().replace(/:/g, "")
  const keys = Object.keys(series)
  const lines = keys.map((key, i) => {
    const values = data.map((d) => Number(d[key]) || 0)
    const top = Math.max(0, ...values)
    const bottom = Math.min(0, ...values)
    // Where zero sits inside the area (0 = top, 1 = bottom).
    const zero = top - bottom > 0 ? top / (top - bottom) : 1
    const green = i === 0 ? POSITIVE : lighter(POSITIVE)
    const red = i === 0 ? NEGATIVE : lighter(NEGATIVE)
    return { key, i, zero, crosses: top > 0 && bottom < 0, onlyNegative: top === 0 && bottom < 0, green, red }
  })
  const config = Object.fromEntries(lines.map((l) => [l.key, { label: series[l.key], color: l.onlyNegative ? l.red : l.green }])) satisfies ChartConfig

  return (
    <ChartContainer config={config} className="aspect-auto h-64 w-full">
      <AreaChart data={data} margin={{ left: 0, right: 12, top: 8 }}>
        <defs>
          {lines.map((l) => (
            <linearGradient key={l.key} id={`${id}-fill-${l.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={l.green} stopOpacity={0.85} />
              <stop offset={l.zero} stopColor={l.green} stopOpacity={0.05} />
              <stop offset={l.zero} stopColor={l.red} stopOpacity={0.05} />
              <stop offset="1" stopColor={l.red} stopOpacity={0.85} />
            </linearGradient>
          ))}
          {lines.map((l) => (
            <linearGradient key={l.key} id={`${id}-line-${l.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset={l.zero} stopColor={l.green} />
              <stop offset={l.zero} stopColor={l.red} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
        <YAxis tickLine={false} axisLine={false} width={48} tickFormatter={(v: number) => compact.format(v)} />
        {lines.some((l) => l.crosses || l.onlyNegative) && <ReferenceLine y={0} stroke="var(--border)" />}
        <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" />} />
        {lines.map((l) => (
          <Area
            key={l.key}
            dataKey={l.key}
            type="natural"
            fill={`url(#${id}-fill-${l.key})`}
            // A gradient on a flat line doesn't render, so only use it when the line crosses zero.
            stroke={l.crosses ? `url(#${id}-line-${l.key})` : l.onlyNegative ? l.red : l.green}
            strokeWidth={2}
            strokeDasharray={l.i > 0 ? "5 4" : undefined}
          />
        ))}
        <ChartLegend content={<ChartLegendContent />} />
      </AreaChart>
    </ChartContainer>
  )
}
