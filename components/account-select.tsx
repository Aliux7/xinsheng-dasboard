"use client"

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox"
import type { Account } from "@/lib/collections"

type Item = { value: string; label: string }

type Props = {
  id?: string
  /** Account number, or "" for none. */
  value: string
  onChange: (account: string) => void
  accounts: Account[]
  required?: boolean
  placeholder?: string
  className?: string
}

/** Account picker from Daftar akun, searchable by number or name. Inactive accounts are hidden unless selected. */
export function AccountSelect({ id, value, onChange, accounts, required, placeholder = "Cari nomor atau nama akun", className }: Props) {
  const items: Item[] = accounts
    .filter((a) => a.active || a.code === value)
    .map((a) => ({ value: a.code, label: `${a.code} · ${a.nameId}` }))
  const selected = items.find((i) => i.value === value) ?? null

  return (
    <Combobox
      items={items}
      value={selected}
      onValueChange={(item: Item | null) => onChange(item?.value ?? "")}
      itemToStringLabel={(item: Item) => item.label}
      isItemEqualToValue={(a: Item, b: Item) => a.value === b.value}
      required={required}
    >
      <ComboboxInput id={id} placeholder={placeholder} className={className ?? "w-full"} />
      <ComboboxContent>
        <ComboboxEmpty>Akun tidak ditemukan.</ComboboxEmpty>
        <ComboboxList>
          {(item: Item) => (
            <ComboboxItem key={item.value} value={item}>
              {item.label}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
