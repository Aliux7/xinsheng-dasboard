"use client"

import { useState, type ReactNode } from "react"
import { FileSpreadsheetIcon, MoreHorizontalIcon, PlusIcon, SearchIcon } from "lucide-react"
import { toast } from "sonner"

import { DataTable, type Column } from "@/components/data-table"
import { ImportDialog, type ImportSpec } from "@/components/import-dialog"
import { SimpleSelect } from "@/components/simple-select"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { useCollection } from "@/hooks/use-collection"
import { addRecord, updateRecord } from "@/lib/db"
import { checkCode, normalizeCode, type MasterRecord } from "@/lib/master"

type Fields<T> = Omit<T, "id">
type SetForm<T> = (patch: Partial<Fields<T>>) => void

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

type Props<T extends MasterRecord> = {
  /** Firestore collection, e.g. "suppliers". */
  path: string
  /** Singular label, e.g. "supplier". */
  noun: string
  /** Columns between Code and Status. */
  columns: Column<T>[]
  /** Text the search box matches against (code is always included). */
  searchText: (row: T) => string[]
  /** Blank record for the Add form. */
  empty: Fields<T>
  /** Form fields between Code and Active. `rows` = all loaded records (e.g. to pick a related one). */
  fields: (form: Fields<T>, set: SetForm<T>, rows: T[]) => ReactNode
  codePlaceholder?: string
  /** Label for the code, e.g. "No. mesin" (default "Kode"). */
  codeLabel?: string
  /** Prefix for automatic codes, e.g. "CUS" → CUS0001, CUS0002…; the code field is then read-only. */
  autoCode?: string
  /** Extra code rule for new records; return an error message or null. */
  validateCode?: (code: string) => string | null
  /** Adjusts the data just before the form saves it. */
  prepare?: (data: Fields<T>) => Fields<T>
  /** Shows rows under headings, e.g. `(a) => a.group`. */
  groupBy?: (row: T) => string
  /** Dropdown filters next to search; options are the distinct values found, e.g. `{ label: "type", value: (p) => p.type }`. */
  filters?: { label: string; value: (row: T) => string }[]
  /** Each adds an "Import Excel" button with a preview before saving. */
  importers?: ImportSpec<T>[]
  /** Extra toolbar buttons. Receives the loaded records. */
  toolbar?: (rows: T[]) => ReactNode
}

export function MasterPage<T extends MasterRecord>(props: Props<T>) {
  const { path, noun, columns, searchText, toolbar, importers = [], filters = [], groupBy } = props
  const loaded = useCollection<T>(path)
  // Natural order, so 2 comes before 10.
  const records = { ...loaded, data: [...loaded.data].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true })) }
  const [search, setSearch] = useState("")
  const [editing, setEditing] = useState<T | "new" | null>(null)
  const [importing, setImporting] = useState<ImportSpec<T> | null>(null)
  const [picked, setPicked] = useState<Record<string, string>>({})

  const q = search.trim().toLowerCase()
  const rows = records.data.filter(
    (r) =>
      [r.code, ...searchText(r)].some((text) => text?.toLowerCase().includes(q)) &&
      filters.every((f) => !picked[f.label] || f.value(r) === picked[f.label])
  )

  const setActive = (r: T, active: boolean) =>
    updateRecord(path, r.id, { active })
      .then(() => toast.success(`${capitalize(noun)} ${r.code} ${active ? "diaktifkan" : "dinonaktifkan"}.`))
      .catch((err) => toast.error(err.message))

  const allColumns: Column<T>[] = [
    { header: props.codeLabel ?? "Kode", cell: (r) => <span className="font-medium">{r.code}</span> },
    ...columns,
    {
      header: "Status",
      cell: (r) => <Badge variant="outline" className={r.active ? undefined : "text-muted-foreground"}>{r.active ? "Aktif" : "Nonaktif"}</Badge>,
    },
    {
      header: "",
      className: "w-12",
      cell: (r) => (
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Aksi untuk ${r.code}`} />}>
            <MoreHorizontalIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setEditing(r)}>Ubah</DropdownMenuItem>
            {r.active ? (
              <DropdownMenuItem variant="destructive" onClick={() => setActive(r, false)}>
                Nonaktifkan
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={() => setActive(r, true)}>Aktifkan</DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:max-w-xs">
          <SearchIcon className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari" className="pl-8" />
        </div>
        {filters.map((f) => (
          <div key={f.label} className="w-full sm:w-44">
            <SimpleSelect
              id={`filter-${f.label}`}
              value={picked[f.label] || "*"}
              onChange={(v) => setPicked((p) => ({ ...p, [f.label]: v === "*" ? "" : v }))}
              options={[
                { value: "*", label: `Semua ${f.label}` },
                ...[...new Set(records.data.map(f.value).filter(Boolean))]
                  .sort((a, b) => a.localeCompare(b))
                  .map((v) => ({ value: v, label: v })),
              ]}
            />
          </div>
        ))}
        <div className="ml-auto flex gap-2">
          {toolbar?.(records.data)}
          {importers.map((spec) => (
            <Button key={spec.sheet} variant="outline" onClick={() => setImporting(spec)}>
              <FileSpreadsheetIcon />
              {spec.title ?? "Impor Excel"}
            </Button>
          ))}
          <Button onClick={() => setEditing("new")}>
            <PlusIcon />
            Tambah {noun}
          </Button>
        </div>
      </div>
      <DataTable
        columns={allColumns}
        groupBy={groupBy}
        {...records}
        data={rows}
        empty={records.data.length ? `Tidak ada ${noun} yang cocok.` : `Belum ada ${noun}.`}
      />
      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          {editing && (
            <MasterForm
              key={editing === "new" ? "new" : editing.id}
              {...props}
              rows={records.data}
              record={editing === "new" ? null : editing}
              onDone={() => setEditing(null)}
            />
          )}
        </DialogContent>
      </Dialog>
      {importing && (
        <ImportDialog
          spec={importing}
          path={path}
          noun={noun}
          existing={records.data}
          open
          onClose={() => setImporting(null)}
        />
      )}
    </>
  )
}

function MasterForm<T extends MasterRecord>({
  path,
  noun,
  empty,
  fields,
  codePlaceholder,
  codeLabel = "Kode",
  autoCode,
  validateCode,
  prepare,
  rows,
  record,
  onDone,
}: Props<T> & { rows: T[]; record: T | null; onDone: () => void }) {
  const [form, setForm] = useState<Fields<T>>(() => {
    if (!record) return autoCode ? { ...empty, code: nextCode(autoCode, rows) } : empty
    const fields: Partial<T> = { ...record }
    delete fields.id // the id is the doc key, not a field
    return fields as Fields<T>
  })
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const set: SetForm<T> = (patch) => setForm((f) => ({ ...f, ...patch }))

  async function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = Object.fromEntries(
      Object.entries(form).map(([k, v]) => [k, typeof v === "string" ? v.trim() : v])
    ) as Fields<T>
    data.code = record ? record.code : normalizeCode(form.code) // code never changes
    const problem = record ? null : (checkCode(data.code) ?? validateCode?.(data.code) ?? null)
    if (problem) return setError(problem)

    setError(null)
    setSaving(true)
    try {
      const final = prepare ? prepare(data) : data
      if (record) await updateRecord(path, record.id, final)
      else await addRecord(path, final, final.code)
      toast.success(`${capitalize(noun)} ${final.code} ${record ? "diperbarui" : "ditambahkan"}.`)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>{record ? `Ubah ${record.code}` : `Tambah ${noun}`}</DialogTitle>
      </DialogHeader>
      <FieldGroup className="my-6">
        <Field>
          <FieldLabel htmlFor="code">{codeLabel}</FieldLabel>
          <Input
            id="code"
            value={form.code}
            onChange={(e) => set({ code: e.target.value.toUpperCase() } as Partial<Fields<T>>)}
            placeholder={codePlaceholder}
            disabled={!!record || !!autoCode}
            required
          />
          {(record || autoCode) && (
            <FieldDescription>
              {record ? "Tidak dapat diubah setelah disimpan." : "Diberikan otomatis."}
            </FieldDescription>
          )}
        </Field>
        {fields(form, set, rows)}
        <Field orientation="horizontal">
          <Switch id="active" checked={form.active} onCheckedChange={(active) => set({ active } as Partial<Fields<T>>)} />
          <FieldLabel htmlFor="active">Aktif</FieldLabel>
        </Field>
        {error && <FieldError>{error}</FieldError>}
      </FieldGroup>
      <DialogFooter>
        <DialogClose render={<Button variant="outline" type="button" />}>Batal</DialogClose>
        <Button type="submit" disabled={saving}>
          {saving ? "Menyimpan…" : "Simpan"}
        </Button>
      </DialogFooter>
    </form>
  )
}

/** Next free code for a prefix: CUS0007 when CUS0006 is the highest. */
function nextCode(prefix: string, rows: MasterRecord[]) {
  const used = rows
    .filter((r) => r.code.startsWith(prefix))
    .map((r) => Number(r.code.slice(prefix.length)))
    .filter(Number.isInteger)
  return prefix + String(Math.max(0, ...used) + 1).padStart(4, "0")
}
