"use client"

import { useState } from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { useCollection } from "@/hooks/use-collection"
import { MATERIALS, MATERIAL_MAPS, PURCHASE_ITEMS, type Material, type MaterialMap, type PurchaseItem } from "@/lib/collections"
import { saveMaterialMap } from "@/lib/inventory"
import { cn } from "@/lib/utils"

/** Link each warehouse material (BB) to the purchase items (IA) that are bought as it. Confirm with the factory. */
export default function MaterialMappingPage() {
  const materials = useCollection<Material>(MATERIALS).data.filter((m) => m.active).sort((a, b) => a.code.localeCompare(b.code))
  const items = useCollection<PurchaseItem>(PURCHASE_ITEMS).data.filter((i) => i.active).sort((a, b) => a.code.localeCompare(b.code))
  const maps = useCollection<MaterialMap>(MATERIAL_MAPS).data
  const [selected, setSelected] = useState("")
  const [search, setSearch] = useState("")

  const owner = (item: string) => maps.find((m) => m.items.includes(item))?.id
  const current = maps.find((m) => m.id === selected)?.items ?? []
  const q = search.trim().toLowerCase()
  const shown = items.filter((i) => `${i.code} ${i.name} ${i.group}`.toLowerCase().includes(q))
  const unmappedMaterials = materials.filter((m) => !maps.find((x) => x.id === m.code)?.items.length)
  const unmappedItems = items.filter((i) => !owner(i.code))

  const toggle = (item: string, on: boolean) =>
    saveMaterialMap(selected, on ? [...current, item] : current.filter((x) => x !== item))
      .then(() => toast.success(on ? `${item} dipetakan ke ${selected}.` : `${item} dilepas dari ${selected}.`))
      .catch((err) => toast.error(err.message))

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Pilih bahan baku gudang (BB) di kiri, lalu centang item pembelian (IA) yang dibeli sebagai bahan itu. Konfirmasi pemetaan dengan pabrik.
        Belum dipetakan: {unmappedMaterials.length} bahan, {unmappedItems.length} item.
      </p>
      <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
        <div className="flex flex-col gap-1 rounded-xl border p-2">
          {materials.map((m) => {
            const count = maps.find((x) => x.id === m.code)?.items.length ?? 0
            return (
              <button
                key={m.code}
                type="button"
                onClick={() => setSelected(m.code)}
                className={cn("flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-muted", selected === m.code && "bg-primary text-primary-foreground hover:bg-primary")}
              >
                <span className="font-medium">{m.code}</span>
                <span className="min-w-0 flex-1 truncate">{m.name}</span>
                {count ? <Badge variant="secondary">{count}</Badge> : <Badge variant="outline" className={`${selected === m.code ? "text-white" : "text-black"}`}>belum</Badge>}
              </button>
            )
          })}
        </div>
        <div className="flex flex-col gap-2 rounded-xl border p-3">
          {selected ? (
            <>
              <Input placeholder="Cari item pembelian" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
              <div className="flex max-h-[60vh] flex-col gap-1 overflow-y-auto">
                {shown.map((i) => {
                  const taken = owner(i.code)
                  return (
                    <label key={i.code} className="flex items-center gap-2 text-sm">
                      <Checkbox checked={current.includes(i.code)} onCheckedChange={(on) => toggle(i.code, on)} disabled={!!taken && taken !== selected} />
                      <span className="w-24 font-medium">{i.code}</span>
                      <span className="min-w-0 flex-1 truncate">{i.name}</span>
                      <span className="hidden truncate text-xs text-muted-foreground md:block">{i.group}</span>
                      {taken && taken !== selected && <Badge variant="outline">{taken}</Badge>}
                      {!taken && <Badge variant="outline" className="text-amber-600">belum</Badge>}
                    </label>
                  )
                })}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Pilih bahan baku di kiri.</p>
          )}
        </div>
      </div>
    </div>
  )
}
