"use client"

import { MasterPage } from "@/components/master-page"
import { NumberInput } from "@/components/number-input"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { PRODUCTS, type Product } from "@/lib/collections"
import { formatNumber, formatRupiah, toNumber } from "@/lib/utils"

const empty: Omit<Product, "id"> = {
  code: "",
  loom: "",
  type: "",
  size: "",
  colour: "",
  grossKg: null,
  tubeKg: null,
  netKg: null,
  print: "",
  unit: "roll",
  price: null,
  active: true,
}

/** Net = gross − paper tube, rounded to grams. */
const net = (gross: number | null, tube: number | null) =>
  gross == null ? null : Math.round((gross - (tube ?? 0)) * 1000) / 1000

export default function ProductsPage() {
  return (
    <MasterPage<Product>
      path={PRODUCTS}
      noun="item penjualan"
      empty={empty}
      searchText={(p) => [p.type, p.size, p.colour, p.loom, p.print, String(p.netKg ?? ""), String(p.price ?? "")]}
      filters={[
        { label: "tipe", value: (p) => p.type },
        { label: "warna", value: (p) => p.colour },
      ]}
      columns={[
        { header: "Tipe", cell: (p) => p.type },
        { header: "Ukuran", cell: (p) => p.size },
        { header: "Warna", cell: (p) => p.colour },
        { header: "Kg bersih", cell: (p) => formatNumber(p.netKg), className: "text-right tabular-nums" },
        { header: "Harga", cell: (p) => formatRupiah(p.price), className: "text-right tabular-nums hidden md:table-cell" },
      ]}
      fields={(form, set) => (
        <>
          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel htmlFor="type">Tipe</FieldLabel>
              <Input id="type" value={form.type} onChange={(e) => set({ type: e.target.value })} placeholder="A2B" required />
            </Field>
            <Field>
              <FieldLabel htmlFor="size">Ukuran</FieldLabel>
              <Input id="size" value={form.size} onChange={(e) => set({ size: e.target.value })} placeholder="4x50m" required />
            </Field>
            <Field>
              <FieldLabel htmlFor="colour">Warna</FieldLabel>
              <Input id="colour" value={form.colour} onChange={(e) => set({ colour: e.target.value })} placeholder="Biru 蓝" required />
            </Field>
            <Field>
              <FieldLabel htmlFor="loom">Kain dasar loom</FieldLabel>
              <Input id="loom" value={form.loom} onChange={(e) => set({ loom: e.target.value })} />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Field>
              <FieldLabel htmlFor="grossKg">Kg kotor</FieldLabel>
              <NumberInput id="grossKg" value={form.grossKg} onChange={(grossKg) => set({ grossKg, netKg: net(grossKg, form.tubeKg) })} />
            </Field>
            <Field>
              <FieldLabel htmlFor="tubeKg">Kg paper tube</FieldLabel>
              <NumberInput id="tubeKg" value={form.tubeKg} onChange={(tubeKg) => set({ tubeKg, netKg: net(form.grossKg, tubeKg) })} />
            </Field>
            <Field>
              <FieldLabel htmlFor="netKg">Kg bersih</FieldLabel>
              <NumberInput id="netKg" value={form.netKg} onChange={(netKg) => set({ netKg })} required />
            </Field>
          </div>
          <FieldDescription className="-mt-3">Kg bersih terisi otomatis dari kg kotor − paper tube; masih bisa diubah.</FieldDescription>
          <Field>
            <FieldLabel htmlFor="print">Cetakan</FieldLabel>
            <Input id="print" value={form.print} onChange={(e) => set({ print: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel htmlFor="unit">Satuan jual</FieldLabel>
              <Input id="unit" value={form.unit} onChange={(e) => set({ unit: e.target.value })} required />
            </Field>
            <Field>
              <FieldLabel htmlFor="price">Harga default (Rp)</FieldLabel>
              <NumberInput id="price" value={form.price} onChange={(price) => set({ price })} step={1} />
            </Field>
          </div>
        </>
      )}
      // TYPE_TERPAL_DAN_BAHAN_BAKU.xlsx. Column A is unused; prices aren't in the file.
      importers={[{
        sheet: "TERPAL",
        codeColumn: 1,
        fromRow: 3,
        toRow: 130,
        columns: [
          { col: "B", header: "Kode", required: true, example: "TP0001" },
          { col: "C", header: "Loom", example: "G1" },
          { col: "D", header: "Tipe", required: true, example: "A5" },
          { col: "E", header: "Ukuran", example: "4x6" },
          { col: "F", header: "Warna (Mandarin)", example: "蓝" },
          { col: "G", header: "Warna (Indonesia)", example: "Biru" },
          { col: "H", header: "Kg kotor", example: "2,5" },
          { col: "I", header: "Kg paper tube", example: "0,1" },
          { col: "J", header: "Kg bersih", example: "2,4" },
          { col: "K", header: "Cetakan", example: "Polos" },
        ],
        parse: ([, code = "", loom = "", type = "", size = "", colourZh = "", colourId = "", gross = "", tube = "", netKg = "", print = ""]) => {
          if (!type) return "Tipe kosong."
          return {
            code,
            data: {
              loom,
              type,
              size,
              colour: [colourId, colourZh].filter(Boolean).join(" "),
              grossKg: toNumber(gross),
              tubeKg: toNumber(tube),
              netKg: toNumber(netKg),
              print,
            },
          }
        },
        defaults: empty,
        newNote: "isi harga setelah impor",
      }]}
    />
  )
}
