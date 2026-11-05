"use client"

import { useLayoutEffect, useRef, useState } from "react"

import { Input } from "@/components/ui/input"

type Props = Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "type" | "min" | "max"> & {
  value: number | null
  onChange: (value: number | null) => void
  min?: number
  max?: number
  /** No thousands separators, e.g. for a year. */
  plain?: boolean
}

const display = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 10 })

/** Typed text (id-ID: "." groups thousands, "," is the decimal comma) → number, or null when blank. */
function parse(text: string) {
  const clean = text.replace(/\./g, "").replace(",", ".")
  if (clean === "" || clean === "-" || clean === ".") return null
  const n = Number(clean)
  return Number.isNaN(n) ? null : n
}

/** Groups the whole part as it's typed ("200000" → "200.000"); the decimals stay exactly as typed ("1,50"). */
function format(text: string, negative: boolean, plain: boolean) {
  const sign = negative && text.trimStart().startsWith("-") ? "-" : ""
  const [whole = "", ...rest] = text.replace(/[^\d,]/g, "").split(",")
  const digits = whole.replace(/^0+(?=\d)/, "")
  const grouped = plain ? digits : digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".")
  return sign + grouped + (rest.length ? "," + rest.join("") : "")
}

const toText = (value: number | null, plain: boolean) =>
  value == null ? "" : plain ? String(value).replace(".", ",") : display.format(value)

/**
 * Number field that shows thousands separators while typing (200000 → 200.000) but stores
 * the plain number, or `null` when empty. id-ID style: "." is only grouping, "," is the decimal comma.
 */
export function NumberInput({ value, onChange, min = 0, max, plain = false, step, ...props }: Props) {
  const ref = useRef<HTMLInputElement>(null)
  const caret = useRef<number | null>(null)
  const [text, setText] = useState(() => toText(value, plain))
  const [shown, setShown] = useState(value)

  // The value changed from outside (reset, computed, another field): show it.
  if (value !== shown) {
    setShown(value)
    if (parse(text) !== value) setText(toText(value, plain))
  }

  // Puts the caret back after the same number of digits it followed before re-formatting.
  useLayoutEffect(() => {
    if (caret.current == null || !ref.current) return
    const want = caret.current
    caret.current = null
    let seen = 0
    let pos = 0
    while (pos < text.length && seen < want) if (/[\d,-]/.test(text[pos++])) seen++
    ref.current.setSelectionRange(pos, pos)
  })

  // Native min/max/step don't apply to a text field, so report them the same way.
  useLayoutEffect(() => {
    const n = parse(text)
    const problem =
      n == null
        ? ""
        : n < min
          ? `Minimal ${display.format(min)}.`
          : max != null && n > max
            ? `Maksimal ${display.format(max)}.`
            : Number(step) === 1 && !Number.isInteger(n)
              ? "Harus bilangan bulat."
              : ""
    ref.current?.setCustomValidity(problem)
  }, [text, min, max, step])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value
    const at = e.target.selectionStart ?? raw.length
    const next = format(raw, min < 0, plain)
    caret.current = [...raw.slice(0, at)].filter((ch) => /[\d,-]/.test(ch)).length
    setText(next)
    const n = parse(next)
    setShown(n)
    if (n !== value) onChange(n)
  }

  return <Input ref={ref} type="text" inputMode="decimal" autoComplete="off" value={text} onChange={handleChange} {...props} />
}
