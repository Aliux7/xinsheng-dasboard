"use client"

import { MasterPage } from "@/components/master-page"
import { NumberInput } from "@/components/number-input"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { CLOTH_GRADES, LOOMS, type ClothGrade, type Loom } from "@/lib/collections"
import { formatNumber, toNumber } from "@/lib/utils"

// Laporan_Kain_Loom-*.xlsx, sheet DATA: one row per production entry, so grades and machines repeat.
const SHEET = { sheet: "DATA", fromRow: 3, toRow: 422, unique: true }

/** Standard weights (g/m²) from the brief, used when the sheet's grade text has no number. */
const KNOWN_WEIGHTS: Record<string, number> = { F: 45, G1: 54, G2: 58, M: 78 }

const emptyGrade: Omit<ClothGrade, "id"> = { code: "", name: "", weight: null, tolerance: 3, baseCloth: "", active: true }

export default function LoomsPage() {
  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Tipe kain</h2>
        <MasterPage<ClothGrade>
          path={CLOTH_GRADES}
          noun="tipe kain"
          empty={emptyGrade}
          codePlaceholder="G1"
          searchText={(g) => [g.name, g.baseCloth]}
          columns={[
            { header: "Nama", cell: (g) => g.name },
            { header: "Standar g/m²", cell: (g) => formatNumber(g.weight), className: "text-right tabular-nums" },
            { header: "Toleransi ±", cell: (g) => formatNumber(g.tolerance), className: "text-right tabular-nums" },
            { header: "Kain dasar", cell: (g) => g.baseCloth || "—", className: "hidden md:table-cell" },
          ]}
          fields={(form, set) => (
            <>
              <Field>
                <FieldLabel htmlFor="name">Nama</FieldLabel>
                <Input id="name" value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="G1 54克" required />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field>
                  <FieldLabel htmlFor="weight">Berat standar g/m²</FieldLabel>
                  <NumberInput id="weight" value={form.weight} onChange={(weight) => set({ weight })} required />
                </Field>
                <Field>
                  <FieldLabel htmlFor="tolerance">Toleransi ± g/m²</FieldLabel>
                  <NumberInput id="tolerance" value={form.tolerance} onChange={(tolerance) => set({ tolerance })} required />
                </Field>
              </div>
              <Field>
                <FieldLabel htmlFor="baseCloth">Kain dasar</FieldLabel>
                <Input id="baseCloth" value={form.baseCloth} onChange={(e) => set({ baseCloth: e.target.value })} placeholder="兰灰布 ABU" />
              </Field>
            </>
          )}
          importers={[
            {
              ...SHEET,
              title: "Impor tipe kain",
              codeColumn: 4,
              description: "Ambil tipe kain dari data roll: tiap nilai unik menjadi satu tipe, mis. G1 54克 → kode G1, 54 g/m².",
              columns: [{ col: "E", header: "Tipe kain", required: true, example: "G1 54克" }],
              parse: ([, , , , grade = ""]) => {
                const [code = "", rest = ""] = grade.split(/\s+(.*)/)
                const weight = toNumber(rest.replace(/[^\d.,]/g, "")) ?? KNOWN_WEIGHTS[code.toUpperCase()] ?? null
                return { code, data: { name: grade, weight } }
              },
              defaults: emptyGrade,
              newNote: "toleransi ±3 g/m²",
            },
          ]}
        />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Mesin loom</h2>
        <MasterPage<Loom>
          path={LOOMS}
          noun="mesin"
          empty={{ code: "", name: "", active: true }}
          codePlaceholder="12"
          codeLabel="No. mesin"
          searchText={(m) => [m.name]}
          columns={[{ header: "Nama / lokasi", cell: (m) => m.name || "—" }]}
          fields={(form, set) => (
            <Field>
              <FieldLabel htmlFor="loomName">Nama / lokasi</FieldLabel>
              <Input id="loomName" value={form.name} onChange={(e) => set({ name: e.target.value })} />
            </Field>
          )}
          importers={[
            {
              ...SHEET,
              title: "Impor mesin",
              codeColumn: 6,
              description: "Ambil nomor mesin dari data roll: tiap nomor unik menjadi satu mesin.",
              columns: [{ col: "G", header: "No. mesin", required: true, example: "12" }],
              parse: ([, , , , , , machine = ""]) => ({ code: machine, data: {} }),
              defaults: { code: "", name: "", active: true },
              newNote: "nama atau lokasi diisi nanti",
            },
          ]}
        />
      </section>
    </div>
  )
}
