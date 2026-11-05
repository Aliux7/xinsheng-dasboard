"use client"

import { useRef, useState } from "react"
import { DownloadIcon, UploadIcon } from "lucide-react"
import { toast } from "sonner"

import { DataTable } from "@/components/data-table"
import { SimpleSelect } from "@/components/simple-select"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import type { Account } from "@/lib/accounts"
import type { Department } from "@/lib/departments"
import type { InventoryItem } from "@/lib/inventory"
import { ITEM_CHUNK, ITEM_COLUMNS, buildItems, downloadItemTemplate, readItems, saveItems, type ItemRow, type ItemSheet } from "@/lib/inventory-import"
import { cn, formatNumber, today } from "@/lib/utils"

/** Workbook → pick one sheet → preview → new items (with opening stock) and unit/group of existing ones. */
export function InventoryImport({
  items,
  departments,
  stockAccounts,
  onDone,
}: {
  items: InventoryItem[]
  departments: Department[]
  stockAccounts: Account[]
  onDone: () => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState("")
  const [sheets, setSheets] = useState<ItemSheet[] | null>(null)
  const [sheet, setSheet] = useState("")
  const [rows, setRows] = useState<ItemRow[] | null>(null)
  const [date, setDate] = useState(today)
  const [withUpdates, setWithUpdates] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function load(f: File | undefined) {
    setSheets(null)
    setSheet("")
    setRows(null)
    setError(null)
    if (!f) return
    setFile(f.name)
    try {
      const all = await readItems(f)
      setSheets(all)
      // A workbook with several sheets: the user picks one first.
      if (all.length === 1) choose(all[0].name, all)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  function choose(name: string, all = sheets) {
    setSheet(name)
    setRows(null)
    setError(null)
    const found = all?.find((s) => s.name === name)
    if (!found) return
    const result = buildItems(found.cells, items, departments, stockAccounts)
    if (!result.length) return setError(`Tidak ada bahan baku di sheet "${name}".`)
    setRows(result)
  }

  const list = rows ?? []
  const count = (status: ItemRow["status"]) => list.filter((r) => !r.error && r.status === status).length
  const ready = list.filter((r) => !r.error && (r.status === "new" || (withUpdates && r.status === "update")))
  const withStock = ready.filter((r) => r.opening > 0).length

  async function save() {
    setSaving(true)
    setError(null)
    let saved = 0
    try {
      for (let i = 0; i < ready.length; i += ITEM_CHUNK) saved += await saveItems(ready.slice(i, i + ITEM_CHUNK), date)
      toast.success(`${saved} bahan baku dari sheet ${sheet} disimpan.`)
      onDone()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (saved) toast.success(`${saved} bahan baku sudah tersimpan sebelum gagal.`)
      setError(saved ? `${message} ${saved} bahan baku pertama sudah tersimpan; import lagi untuk sisanya (yang sudah ada tidak dobel).` : message)
    }
    setSaving(false)
  }

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <DialogHeader>
        <DialogTitle>Import stok bahan baku</DialogTitle>
        <DialogDescription>
          Satu baris = satu bahan baku. Bahan baku dicocokkan dari kodenya (atau namanya, untuk bahan baku lama yang belum punya kode): yang baru ditambahkan dengan
          stok awalnya, yang sudah ada hanya diperbarui nama, satuan dan grupnya (stoknya tidak diubah).
        </DialogDescription>
      </DialogHeader>

      <div className="flex min-w-0 flex-col gap-1">
        <div className="overflow-x-auto rounded-md border">
          <table className="w-max border-collapse text-xs">
            <thead>
              <tr className="bg-muted text-muted-foreground">
                <th className="w-8 border-r border-b" />
                {ITEM_COLUMNS.map((c) => (
                  <th key={c.col} className="border-r border-b px-2 py-0.5 font-normal last:border-r-0">
                    {c.col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border-r border-b bg-muted px-2 py-1 text-center text-muted-foreground">1</td>
                {ITEM_COLUMNS.map((c) => (
                  <td key={c.col} className={cn("border-r border-b px-2 py-1 font-semibold whitespace-nowrap last:border-r-0", c.required && "bg-black text-white")}>
                    {c.label}
                  </td>
                ))}
              </tr>
              <tr className="text-muted-foreground italic">
                <td className="border-r border-b bg-muted px-2 py-1 text-center not-italic">2</td>
                {ITEM_COLUMNS.map((c) => (
                  <td key={c.col} className="min-w-24 border-r border-b px-2 py-1 whitespace-nowrap last:border-r-0">
                    {c.example}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">Header hitam wajib diisi. Baris header boleh ada atau tidak. Stok awal boleh kosong (= 0). Departemen boleh kosong, atau diisi kode/nama dari halaman Departemen.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" onClick={() => downloadItemTemplate().catch((err) => toast.error(err.message))}>
          <DownloadIcon />
          Unduh template
        </Button>
        <Button type="button" onClick={() => input.current?.click()} disabled={saving}>
          <UploadIcon />
          Unggah file
        </Button>
        {file && <span className="truncate text-sm text-muted-foreground">{file}</span>}
        <input
          ref={input}
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={(e) => {
            load(e.target.files?.[0])
            e.target.value = "" // so the same file can be chosen again
          }}
        />
      </div>

      {sheets && sheets.length > 1 && (
        <Field className="w-full sm:w-96">
          <FieldLabel htmlFor="sheet">Pilih sheet yang diimport ({sheets.length} sheet di file ini)</FieldLabel>
          <SimpleSelect id="sheet" value={sheet} onChange={(name) => choose(name)} required placeholder="Pilih sheet" options={sheets.map((s) => ({ value: s.name, label: s.name }))} />
        </Field>
      )}

      {rows && (
        <>
          <DataTable
            columns={[
              { header: "Baris", cell: (r) => r.row, className: "tabular-nums" },
              {
                header: "Bahan baku",
                cell: (r) => (
                  <div className="whitespace-normal">
                    <div className="font-medium">
                      {r.code && <span className="text-muted-foreground">{r.code} · </span>}
                      {r.name || "—"}
                    </div>
                    {r.group && <div className="text-xs text-muted-foreground">{r.group}</div>}
                  </div>
                ),
              },
              { header: "Satuan", cell: (r) => r.unit },
              { header: "Departemen", cell: (r) => r.department || <span className="text-muted-foreground">—</span> },
              {
                header: "Stok awal",
                cell: (r) =>
                  r.opening ? (
                    <div>
                      <div>{formatNumber(r.opening)}</div>
                      <div className="text-xs text-muted-foreground">Rp {formatNumber(r.openingValue)}</div>
                    </div>
                  ) : (
                    ""
                  ),
                className: "text-right tabular-nums",
              },
              { header: "Akun", cell: (r) => r.account || <span className="text-muted-foreground">—</span> },
              {
                header: "Status",
                cell: (r) => (
                  <div className="flex flex-col items-start gap-1 text-xs whitespace-normal">
                    {r.error ? (
                      <span className="text-destructive">{r.error}</span>
                    ) : r.status === "new" ? (
                      <Badge variant="success">Baru</Badge>
                    ) : r.status === "update" ? (
                      <Badge variant="brand">Diperbarui: {r.changes.join(", ")}</Badge>
                    ) : (
                      <Badge variant="outline">Sudah sama</Badge>
                    )}
                    {r.warnings.map((w) => (
                      <span key={w} className="text-warning">
                        {w}
                      </span>
                    ))}
                  </div>
                ),
                className: "max-w-72",
              },
            ]}
            data={list.map((r) => ({ ...r, id: String(r.row) }))}
            loading={false}
            error={null}
            empty="Tidak ada bahan baku."
            rowClassName={(r) => (ready.some((x) => x.row === r.row) ? undefined : "text-muted-foreground")}
          />
          <div className="flex flex-wrap items-end gap-4">
            {withStock > 0 && (
              <Field className="w-full sm:w-48">
                <FieldLabel htmlFor="idate">Tanggal stok awal</FieldLabel>
                <Input id="idate" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
              </Field>
            )}
            {count("update") > 0 && (
              <Field orientation="horizontal" className="w-auto">
                <Checkbox id="updates" checked={withUpdates} onCheckedChange={setWithUpdates} />
                <FieldLabel htmlFor="updates">Perbarui {count("update")} bahan baku yang sudah ada</FieldLabel>
              </Field>
            )}
          </div>
          <p className="text-sm">
            {count("new")} bahan baku baru ({withStock} dengan stok awal) · {count("update")} berbeda dengan yang tersimpan · {count("same")} sudah sama
            {list.some((r) => r.error) && <> · {list.filter((r) => r.error).length} bermasalah (tidak disimpan)</>}
          </p>
          <Button className="w-fit" onClick={save} disabled={saving || !ready.length || (withStock > 0 && !date)}>
            {saving ? "Menyimpan…" : `Simpan ${ready.length} bahan baku`}
          </Button>
        </>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
