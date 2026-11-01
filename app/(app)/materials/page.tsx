"use client"

import { MasterPage } from "@/components/master-page"
import { NumberInput } from "@/components/number-input"
import { SimpleSelect } from "@/components/simple-select"
import { Badge } from "@/components/ui/badge"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useCollection } from "@/hooks/use-collection"
import {
  CONDITIONS,
  DEPARTMENTS,
  MATERIALS,
  type Condition,
  type Department,
  type Material,
} from "@/lib/collections"
import { formatNumber } from "@/lib/utils"

const empty: Omit<Material, "id"> = {
  code: "",
  name: "",
  group: "",
  unit: "kg",
  department: "",
  condition: "original",
  cleanTo: "",
  minStock: null,
  active: true,
}

const conditionOptions = Object.entries(CONDITIONS).map(([value, label]) => ({ value, label }))

export default function MaterialsPage() {
  const departments = useCollection<Department>(DEPARTMENTS, { orderBy: "code" }).data
  const deptName = (code: string) => departments.find((d) => d.code === code)?.name || code || "—"

  return (
    <MasterPage<Material>
      path={MATERIALS}
      noun="bahan baku"
      empty={empty}
      codePlaceholder="BB20003"
      searchText={(m) => [m.name, m.group]}
      // Stock only changes through stock movements (lib/stock.ts), never from this form.
      prepare={(data) => {
        const rest = { ...data }
        delete rest.stock
        return rest
      }}
      columns={[
        { header: "Nama", cell: (m) => m.name },
        { header: "Grup", cell: (m) => m.group, className: "hidden md:table-cell" },
        { header: "Departemen", cell: (m) => deptName(m.department), className: "hidden lg:table-cell" },
        {
          header: "Kondisi",
          cell: (m) => (
            <span className="flex flex-wrap items-center gap-1">
              <Badge variant={m.condition === "dirty" ? "secondary" : "outline"}>{CONDITIONS[m.condition]}</Badge>
              {m.condition === "dirty" && m.cleanTo && <span className="text-xs text-muted-foreground">→ {m.cleanTo}</span>}
            </span>
          ),
        },
        {
          header: "Stok",
          cell: (m) => (
            <span className={m.minStock != null && (m.stock ?? 0) < m.minStock ? "text-amber-600" : undefined}>
              {m.stock == null ? "—" : `${formatNumber(m.stock)} ${m.unit}`}
            </span>
          ),
          className: "text-right tabular-nums",
        },
      ]}
      fields={(form, set, materials) => (
        <>
          <Field>
            <FieldLabel htmlFor="name">Nama</FieldLabel>
            <Input id="name" value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="HD SEMBUR KOTOR 杂盖料片(脏)" required />
          </Field>
          <Field>
            <FieldLabel htmlFor="group">Grup</FieldLabel>
            <Input id="group" value={form.group} onChange={(e) => set({ group: e.target.value })} placeholder="HDPE daur ulang 回生-低压 HDPE" required />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel htmlFor="unit">Satuan</FieldLabel>
              <Input id="unit" value={form.unit} onChange={(e) => set({ unit: e.target.value })} required />
            </Field>
            <Field>
              <FieldLabel htmlFor="minStock">Stok minimum</FieldLabel>
              <NumberInput id="minStock" value={form.minStock} onChange={(minStock) => set({ minStock })} />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="department">Departemen</FieldLabel>
            <SimpleSelect
              id="department"
              value={form.department}
              onChange={(department) => set({ department })}
              options={departments
                .filter((d) => d.active || d.code === form.department)
                .map((d) => ({ value: d.code, label: `${d.code} · ${d.name}` }))}
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="condition">Kondisi</FieldLabel>
            <SimpleSelect
              id="condition"
              value={form.condition}
              onChange={(v) => set({ condition: v as Condition, cleanTo: v === "dirty" ? form.cleanTo : "" })}
              options={conditionOptions}
              required
            />
          </Field>
          {form.condition === "dirty" && (
            <Field>
              <FieldLabel htmlFor="cleanTo">Setelah dicuci menjadi</FieldLabel>
              <SimpleSelect
                id="cleanTo"
                value={form.cleanTo}
                onChange={(cleanTo) => set({ cleanTo })}
                options={materials
                  .filter((m) => m.condition === "clean" && m.code !== form.code)
                  .map((m) => ({ value: m.code, label: `${m.code} · ${m.name}` }))}
                placeholder="Pilih bahan Bersih"
                required
              />
              <FieldDescription>Hanya bahan dengan kondisi Bersih yang ditampilkan.</FieldDescription>
            </Field>
          )}
        </>
      )}
      // Laporan_Bahan_Baku-*.xlsx. Rows are code, group, name, unit, department.
      importers={[{
        sheet: "KODE",
        fromRow: 2,
        toRow: 17,
        columns: [
          { col: "A", header: "Kode", required: true, example: "BB10001" },
          { col: "B", header: "Grup", example: "PP" },
          { col: "C", header: "Nama", required: true, example: "Biji plastik PP" },
          { col: "D", header: "Satuan", example: "kg" },
          { col: "E", header: "Departemen", required: true, example: "LOOM" },
        ],
        parse: ([code = "", group = "", name = "", unit = "", dept = ""]) => {
          const department = dept.toUpperCase()
          if (!name) return "Nama kosong."
          if (!departments.some((d) => d.code === department)) {
            return `Departemen "${dept || "(kosong)"}" belum ada. Tambahkan di Departemen, lalu impor lagi.`
          }
          return { code, data: { group, name, unit: unit || "kg", department } }
        },
        defaults: empty,
        newNote: "atur kondisi (dan kotor → bersih) setelah impor",
      }]}
    />
  )
}
