"use client"

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
  ComboboxValue,
} from "@/components/ui/combobox"
import { cn } from "@/lib/utils"

type Option = { value: string; label: string }

type Props = {
  id: string
  value: string
  onChange: (value: string) => void
  options: Option[]
  placeholder?: string
  required?: boolean
  disabled?: boolean
}

/**
 * Single-choice dropdown from a list of options: opens a search box above a scrollable list.
 * `required` shows the * on its FieldLabel.
 */
export function SimpleSelect({ id, value, onChange, options, placeholder = "Pilih…", required, disabled }: Props) {
  const selected = options.find((o) => o.value === value) ?? null

  return (
    <Combobox
      items={options}
      value={selected}
      onValueChange={(o: Option | null) => onChange(o?.value ?? "")}
      itemToStringLabel={(o: Option) => o.label}
      isItemEqualToValue={(a: Option, b: Option) => a.value === b.value}
      required={required}
      disabled={disabled}
    >
      <ComboboxTrigger
        id={id}
        className={cn(
          "flex h-8 w-full items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent py-2 pr-2 pl-2.5 text-left text-sm whitespace-nowrap transition-colors outline-none select-none",
          "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30 dark:hover:bg-input/50"
        )}
      >
        <span className={cn("truncate", !selected && "text-muted-foreground")}>
          <ComboboxValue>{(o: Option | null) => o?.label ?? placeholder}</ComboboxValue>
        </span>
      </ComboboxTrigger>
      <ComboboxContent className="min-w-(--anchor-width)">
        <ComboboxInput placeholder="Cari…" showTrigger={false} aria-label="Cari pilihan" />
        <ComboboxEmpty>Tidak ditemukan.</ComboboxEmpty>
        <ComboboxList>
          {(o: Option) => (
            <ComboboxItem key={o.value} value={o}>
              {o.label}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
