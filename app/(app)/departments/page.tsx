"use client"

import { useState } from "react"
import Link from "next/link"
import { PencilIcon, PlusIcon } from "lucide-react"
import { toast } from "sonner"

import { DataTable, type Column } from "@/components/data-table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useCollection } from "@/hooks/use-collection"
import { DEPARTMENTS, saveDepartment, type Department } from "@/lib/departments"
import { INVENTORY_ITEMS, type InventoryItem } from "@/lib/inventory"

export default function DepartmentsPage() {
  const departments = useCollection<Department>(DEPARTMENTS, { orderBy: "code" })
  const items = useCollection<InventoryItem>(INVENTORY_ITEMS)
  const [showInactive, setShowInactive] = useState(false)
  const [editing, setEditing] = useState<Department | "new" | null>(null)

  const used = new Map<string, number>()
  for (const i of items.data) if (i.department) used.set(i.department, (used.get(i.department) ?? 0) + 1)
  const shown = departments.data.filter((d) => showInactive || d.active !== false)

  const columns: Column<Department>[] = [
    { header: "Kode", cell: (d) => <span className="font-medium">{d.code}</span> },
    { header: "Nama", cell: (d) => d.name },
    {
      header: "Bahan baku",
      cell: (d) =>
        used.get(d.code) ? (
          <Link className="underline underline-offset-4" href={`/inventory?department=${encodeURIComponent(d.code)}`}>
            {used.get(d.code)} bahan baku
          </Link>
        ) : (
          <span className="text-muted-foreground">0</span>
        ),
      className: "text-right tabular-nums",
    },
    { header: "Status", cell: (d) => d.active === false && <Badge variant="outline">Nonaktif</Badge> },
    {
      header: "",
      cell: (d) => (
        <Button size="sm" variant="outline" onClick={() => setEditing(d)} aria-label={`Ubah ${d.code}`}>
          <PencilIcon />
          Ubah
        </Button>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Field orientation="horizontal" className="w-auto">
          <Checkbox id="inactive" checked={showInactive} onCheckedChange={setShowInactive} />
          <FieldLabel htmlFor="inactive">Tampilkan nonaktif</FieldLabel>
        </Field>
        <span className="text-sm text-muted-foreground">{shown.length} departemen</span>
        <Button className="ml-auto" onClick={() => setEditing("new")}>
          <PlusIcon />
          Tambah departemen
        </Button>
      </div>
      <DataTable
        columns={columns}
        {...departments}
        data={shown}
        empty="Belum ada departemen."
        rowClassName={(d) => (d.active === false ? "text-muted-foreground" : undefined)}
      />

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          {editing && <DepartmentForm department={editing === "new" ? null : editing} taken={new Set(departments.data.map((d) => d.code))} onDone={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** Add (department = null) or edit; the code is locked once saved. */
function DepartmentForm({ department, taken, onDone }: { department: Department | null; taken: Set<string>; onDone: () => void }) {
  const [code, setCode] = useState(department?.code ?? "")
  const [name, setName] = useState(department?.name ?? "")
  const [active, setActive] = useState(department?.active !== false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const c = code.trim().toUpperCase()
    if (!department && taken.has(c)) return setError(`Kode ${c} sudah ada.`)
    setError(null)
    setBusy(true)
    try {
      await saveDepartment({ code: c, name, active }, !department)
      toast.success(`Departemen ${c} ${department ? "disimpan" : "ditambahkan"}.`)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
    setBusy(false)
  }

  return (
    <form onSubmit={submit}>
      <DialogHeader>
        <DialogTitle>{department ? `Ubah departemen ${department.code}` : "Tambah departemen"}</DialogTitle>
      </DialogHeader>
      <div className="my-6 flex flex-col gap-4">
        <Field>
          <FieldLabel htmlFor="code">Kode</FieldLabel>
          <Input id="code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="LOOM" disabled={!!department} required />
          {!department && <FieldDescription>Tidak bisa diubah setelah disimpan.</FieldDescription>}
        </Field>
        <Field>
          <FieldLabel htmlFor="name">Nama</FieldLabel>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Loom 织布" required />
        </Field>
        {department && (
          <Field orientation="horizontal">
            <Checkbox id="active" checked={active} onCheckedChange={setActive} />
            <FieldLabel htmlFor="active">Aktif</FieldLabel>
          </Field>
        )}
        {error && <FieldError>{error}</FieldError>}
      </div>
      <DialogFooter>
        <DialogClose render={<Button variant="outline" type="button" />}>Batal</DialogClose>
        <Button type="submit" disabled={busy}>
          {busy ? "Menyimpan…" : "Simpan"}
        </Button>
      </DialogFooter>
    </form>
  )
}
