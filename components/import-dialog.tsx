"use client"

import { useState } from "react"
import { toast } from "sonner"

import { DataTable, type Column } from "@/components/data-table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FieldError } from "@/components/ui/field"
import { ImportTemplate } from "@/components/import-template"
import { addRecord, updateRecord } from "@/lib/db"
import { readRows } from "@/lib/excel"
import type { TemplateColumn } from "@/lib/excel-template"
import { checkCode, normalizeCode, type MasterRecord } from "@/lib/master"

/** Describes how one Excel sheet maps onto a master-data collection. */
export type ImportSpec<T extends MasterRecord> = {
  /** Button label when a page has several importers, e.g. "Import COA". */
  title?: string
  sheet: string
  fromRow: number
  /** Last row read (default: to the end of the sheet). */
  toRow?: number
  /** 0-based column holding the code (default 0 = column A). Used to label skipped rows. */
  codeColumn?: number
  /** Short explanation under the title; a default one is used when left out. */
  description?: string
  /** The columns the parser reads, for the template preview and download. */
  columns: TemplateColumn[]
  /** Extra hint under the template preview, e.g. allowed values. */
  note?: string
  /**
   * One row → its code and fields (plus an optional note), or a message explaining why it's skipped.
   * `current` is the saved record with that code, if any. Fully blank rows never reach here.
   */
  parse: (
    cells: string[],
    current: T | undefined
  ) => { code: string; data: Partial<Omit<T, "id">>; note?: string } | string
  /** Values for fields a new record needs that the sheet doesn't have. */
  defaults: Omit<T, "id">
  /** Note shown on "new" rows, e.g. what to fill in afterwards. */
  newNote?: string
  /** Rows repeat the same code on purpose (e.g. a log sheet): show each code once, hide the repeats. */
  unique?: boolean
  /** Runs once before saving, e.g. to create records the rows refer to. */
  beforeSave?: (rows: { code: string; data: Partial<Omit<T, "id">> }[]) => Promise<void>
}

type Status = "new" | "updated" | "skipped"
type PreviewRow = {
  id: string
  row: number
  code: string
  status: Status
  note: string
  data: Record<string, unknown>
}

const statusVariant = { new: "default", updated: "secondary", skipped: "outline" } as const
const statusLabel = { new: "baru", updated: "diubah", skipped: "dilewati" } as const

const columns: Column<PreviewRow>[] = [
  { header: "Baris", cell: (r) => r.row, className: "text-muted-foreground" },
  { header: "Kode", cell: (r) => r.code || "—" },
  { header: "Hasil", cell: (r) => <Badge variant={statusVariant[r.status]}>{statusLabel[r.status]}</Badge> },
  { header: "Keterangan", cell: (r) => r.note, className: "text-muted-foreground whitespace-normal" },
]

const text = (v: unknown) => (v == null ? "" : String(v))

function buildPreview<T extends MasterRecord>(rows: string[][], spec: ImportSpec<T>, existing: T[]) {
  const byCode = new Map(existing.map((r) => [r.code, r]))
  const firstRow = new Map<string, number>()
  const preview: PreviewRow[] = []

  rows.forEach((cells, i) => {
    if (cells.every((c) => !c)) return // blank rows are skipped silently
    const base = { id: String(i), row: spec.fromRow + i, code: normalizeCode(cells[spec.codeColumn ?? 0] ?? ""), data: {} }
    const skip = (note: string) => preview.push({ ...base, status: "skipped", note })

    if (spec.unique && firstRow.has(base.code)) return // cheap early exit for repeats
    const parsed = spec.parse(cells, byCode.get(base.code))
    if (typeof parsed === "string") return skip(parsed)
    const code = normalizeCode(parsed.code)
    const problem = checkCode(code)
    if (problem) return skip(problem)
    const first = firstRow.get(code)
    if (first) return spec.unique ? undefined : skip(`Duplikat dari baris ${first} — yang pertama dipakai.`)
    firstRow.set(code, base.row)

    const current = byCode.get(code) as Record<string, unknown> | undefined
    const values = parsed.data as Record<string, unknown>
    if (!current) {
      const summary = Object.values(values).map(text).filter((v) => v && v !== "true").join(" · ")
      const note = [summary, parsed.note, spec.newNote].filter(Boolean).join(" — ")
      return preview.push({ ...base, code, status: "new", data: values, note })
    }
    const changed = Object.fromEntries(Object.entries(values).filter(([k, v]) => text(v) !== text(current[k])))
    const keys = Object.keys(changed)
    if (!keys.length) return skip("Sudah sesuai.")
    const diff = keys.map((k) => `${k}: ${text(current[k]) || "∅"} → ${text(changed[k])}`).join("; ")
    preview.push({ ...base, code, status: "updated", data: changed, note: [diff, parsed.note].filter(Boolean).join(" — ") })
  })
  return preview
}

type Props<T extends MasterRecord> = {
  spec: ImportSpec<T>
  path: string
  noun: string
  existing: T[]
  open: boolean
  onClose: () => void
}

export function ImportDialog<T extends MasterRecord>({ open, onClose, ...props }: Props<T>) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">{open && <ImportForm {...props} onDone={onClose} />}</DialogContent>
    </Dialog>
  )
}

function ImportForm<T extends MasterRecord>({ spec, path, noun, existing, onDone }: Omit<Props<T>, "open" | "onClose"> & { onDone: () => void }) {
  const [preview, setPreview] = useState<PreviewRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const changes = preview?.filter((r) => r.status !== "skipped") ?? []
  const count = (s: Status) => preview?.filter((r) => r.status === s).length ?? 0
  const duplicates = preview?.filter((r) => r.note.startsWith("Duplikat")).map((r) => `${r.code} (baris ${r.row})`) ?? []

  async function handleFile(file: File | undefined) {
    setPreview(null)
    setError(null)
    if (!file) return
    try {
      setPreview(buildPreview(await readRows(file, spec.sheet, spec.fromRow, spec.toRow), spec, existing))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleSave() {
    setSaving(true)
    try {
      await spec.beforeSave?.(changes.map((r) => ({ code: r.code, data: r.data as Partial<Omit<T, "id">> })))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSaving(false)
      return
    }
    const results = await Promise.allSettled(
      changes.map((r) =>
        r.status === "new"
          ? addRecord(path, { ...spec.defaults, ...r.data, code: r.code }, r.code)
          : updateRecord(path, r.code, r.data)
      )
    )
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === "rejected")
    if (failed.length) {
      setError(`${failed.length} baris gagal: ${failed[0].reason?.message}`)
      setSaving(false)
      return
    }
    toast.success(`Impor ${noun} selesai: ${count("new")} baru, ${count("updated")} diperbarui, ${count("skipped")} dilewati.`)
    onDone()
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{spec.title ?? `Impor ${noun} dari Excel`}</DialogTitle>
        <DialogDescription>
          {spec.description ?? `Tambah atau perbarui ${noun} sekaligus dari file Excel; kode yang sudah ada diperbarui.`} Unduh template, isi
          datanya, lalu unggah. Tidak ada yang disimpan sebelum Anda konfirmasi.
        </DialogDescription>
      </DialogHeader>
      <ImportTemplate
        sheets={[{ name: spec.sheet, headerRow: spec.fromRow - 1, lastRow: spec.toRow, note: spec.note, columns: spec.columns }]}
        fileName={`template-${(spec.title ?? `impor ${noun}`).toLowerCase().replace(/^impor\s+/, "").replace(/\s+/g, "-")}.xlsx`}
        onFile={handleFile}
      />
      {preview && (
        <>
          <p className="text-sm">
            <strong>{count("new")}</strong> baru · <strong>{count("updated")}</strong> diubah ·{" "}
            <strong>{count("skipped")}</strong> dilewati
            {duplicates.length > 0 && <> ({duplicates.length} duplikat: {duplicates.join(", ")})</>}
          </p>
          <div className="max-h-80 overflow-y-auto">
            <DataTable columns={columns} data={preview} loading={false} error={null} empty="Tidak ada baris." />
          </div>
        </>
      )}
      {error && <FieldError>{error}</FieldError>}
      <DialogFooter>
        <DialogClose render={<Button variant="outline" type="button" />}>Batal</DialogClose>
        <Button onClick={handleSave} disabled={!changes.length || saving}>
          {saving ? "Menyimpan…" : `Simpan ${changes.length} perubahan`}
        </Button>
      </DialogFooter>
    </>
  )
}
