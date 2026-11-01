"use client"

import { useState } from "react"
import { toast } from "sonner"

import { MasterPage } from "@/components/master-page"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { DEPARTMENTS, type Department } from "@/lib/collections"
import { addRecord } from "@/lib/db"

const STARTERS: Omit<Department, "id">[] = [
  { code: "EXTRUDER", name: "Extruder 拉丝", active: true },
  { code: "LAMINASI", name: "Laminasi 覆膜", active: true },
]

export default function DepartmentsPage() {
  const [adding, setAdding] = useState(false)

  async function addStarters(missing: Omit<Department, "id">[]) {
    setAdding(true)
    await Promise.all(missing.map((d) => addRecord(DEPARTMENTS, d, d.code)))
      .then(() => toast.success(`Departemen ${missing.map((d) => d.code).join(", ")} ditambahkan.`))
      .catch((err) => toast.error(err.message))
    setAdding(false)
  }

  return (
    <MasterPage<Department>
      path={DEPARTMENTS}
      noun="departemen"
      empty={{ code: "", name: "", active: true }}
      codePlaceholder="LOOM"
      searchText={(d) => [d.name]}
      columns={[{ header: "Nama", cell: (d) => d.name }]}
      fields={(form, set) => (
        <Field>
          <FieldLabel htmlFor="name">Nama</FieldLabel>
          <Input id="name" value={form.name} onChange={(e) => set({ name: e.target.value })} required />
        </Field>
      )}
      toolbar={(departments) => {
        const missing = STARTERS.filter((s) => !departments.some((d) => d.code === s.code))
        return (
          missing.length > 0 && (
            <Button variant="outline" disabled={adding} onClick={() => addStarters(missing)}>
              Tambah {missing.map((d) => d.name).join(" & ")}
            </Button>
          )
        )
      }}
    />
  )
}
