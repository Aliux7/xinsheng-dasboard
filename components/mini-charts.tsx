"use client"

import { useId } from "react"
import { Bar, BarChart, Cell, Label, LabelList, Pie, PieChart, XAxis, YAxis } from "recharts"

import { lighter, tone } from "@/components/chart-tone"
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"

/** One part of a chart. `warn` shows it in red even though the amount is positive (e.g. overdue). */
export type Slice = { key: string; label: string; value: number; warn?: boolean }

const compact = new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 })

/** Each slice with its colour (green/red, bolder when bigger) and the gradient id that fills it. */
function colour(slices: Slice[], id: string) {
  const max = Math.max(0, ...slices.map((s) => Math.abs(s.value)))
  return slices.map((s) => ({ ...s, color: tone(s.value, max, s.warn), gradient: `${id}-${s.key}` }))
}

const configOf = (slices: { key: string; label: string; color: string }[]) =>
  Object.fromEntries(slices.map((s) => [s.key, { label: s.label, color: s.color }])) satisfies ChartConfig

/**
 * Amount next to a bar, always on the right so it never covers the row label: after the tip of a
 * positive bar, and just right of the zero line (in red) for a negative one.
 */
function ValueLabel({ x, y, width, height, value }: { x?: number | string; y?: number | string; width?: number | string; height?: number | string; value?: unknown }) {
  const n = Number(value)
  const left = Number(x)
  const right = Math.max(left, left + Number(width))
  return (
    <text x={right + 6} y={Number(y) + Number(height) / 2} dominantBaseline="central" fontSize={11} className={n < 0 ? "fill-destructive" : "fill-foreground"}>
      {compact.format(n)}
    </text>
  )
}

function Empty() {
  return <div className="flex h-44 items-center justify-center text-xs text-muted-foreground">Belum ada data.</div>
}

/** Donut with the total (or any short text) in the middle and a legend underneath. Zero slices are left out. */
export function Donut({ slices, center, centerLabel }: { slices: Slice[]; center: string; centerLabel: string }) {
  const id = useId().replace(/:/g, "")
  const data = colour(
    slices.filter((s) => s.value > 0),
    id
  ).map((s) => ({ ...s, fill: `url(#${s.gradient})` }))
  if (!data.length) return <Empty />
  return (
    <ChartContainer config={configOf(data)} className="mx-auto aspect-auto h-52 w-full">
      <PieChart>
        <defs>
          {data.map((s) => (
            <linearGradient key={s.key} id={s.gradient} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={lighter(s.color)} />
              <stop offset="100%" stopColor={s.color} />
            </linearGradient>
          ))}
        </defs>
        <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel nameKey="key" />} />
        <Pie data={data} dataKey="value" nameKey="key" innerRadius={48} outerRadius={70} strokeWidth={3} cy="42%">
          <Label
            content={({ viewBox }) =>
              viewBox && "cx" in viewBox && "cy" in viewBox ? (
                <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle">
                  <tspan x={viewBox.cx} y={(viewBox.cy ?? 0) - 2} dominantBaseline="auto" className="fill-foreground text-base font-semibold">
                    {center}
                  </tspan>
                  <tspan x={viewBox.cx} y={(viewBox.cy ?? 0) + 6} dominantBaseline="hanging" className="fill-muted-foreground text-[10px]">
                    {centerLabel}
                  </tspan>
                </text>
              ) : null
            }
          />
        </Pie>
        <ChartLegend content={<ChartLegendContent nameKey="key" />} className="flex-wrap gap-y-1" />
      </PieChart>
    </ChartContainer>
  )
}

/** Horizontal bars, one per row, value at the bar's end; the gradient runs from pale at zero to bold at the tip. */
export function Bars({ slices }: { slices: Slice[] }) {
  const id = useId().replace(/:/g, "")
  if (!slices.some((s) => s.value !== 0)) return <Empty />
  const data = colour(slices, id)
  return (
    <ChartContainer config={configOf(data)} className="aspect-auto w-full" style={{ height: slices.length * 36 + 8 }}>
      <BarChart data={data} layout="vertical" margin={{ left: 0, right: 56 }}>
        <defs>
          {data.map((s) => (
            // A negative bar grows to the left, so its bold end is on the left.
            <linearGradient key={s.key} id={s.gradient} x1={s.value < 0 ? "1" : "0"} y1="0" x2={s.value < 0 ? "0" : "1"} y2="0">
              <stop offset="0%" stopColor={lighter(s.color)} />
              <stop offset="100%" stopColor={s.color} />
            </linearGradient>
          ))}
        </defs>
        <YAxis dataKey="label" type="category" tickLine={false} axisLine={false} width={104} />
        <XAxis dataKey="value" type="number" hide domain={[(min: number) => Math.min(0, min), (max: number) => Math.max(0, max)]} />
        <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel nameKey="key" />} />
        <Bar dataKey="value" radius={4} barSize={20}>
          {data.map((s) => (
            <Cell key={s.key} fill={`url(#${s.gradient})`} />
          ))}
          <LabelList dataKey="value" content={ValueLabel} />
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}
