/**
 * Chart colours follow the value: positive amounts are green, negative amounts red, and the bigger
 * the amount (compared with the largest one in the same chart) the bolder the colour.
 * Base colours: `--chart-positive` / `--chart-negative` in app/globals.css.
 */
export const POSITIVE = "var(--chart-positive)"
export const NEGATIVE = "var(--chart-negative)"

/** Solid shade for `value`: 35% strength (small) up to 100% (the largest in the chart). `warn` = red even when positive. */
export function tone(value: number, max: number, warn = false) {
  const t = max > 0 ? Math.min(1, Math.abs(value) / max) : 1
  return `color-mix(in oklch, ${value < 0 || warn ? NEGATIVE : POSITIVE} ${Math.round(35 + 65 * t)}%, white)`
}

/** The pale end of a gradient that ends in `color`. */
export const lighter = (color: string) => `color-mix(in oklch, ${color} 45%, white)`
