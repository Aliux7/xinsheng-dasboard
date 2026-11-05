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
import { ACCOUNT_TYPES, type Account } from "@/lib/accounts"
import { COA_COLUMNS, COA_EXAMPLE, buildCoa, countAccounts, downloadCoaTemplate, readCoa, saveCoa, type CoaSheet, type ParsedCoa } from "@/lib/account-import"
import { cn } from "@/lib/utils"

/** Accounts per transaction: each is a document and a log entry; Firestore allows 500 writes. */
const CHUNK = 150

/** COA workbook → pick one sheet → preview → new and changed accounts into Daftar akun. */
export function AccountImport({ accounts, onDone }: { accounts: Account[]; onDone: () => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState("")
  const [sheets, setSheets] = useState<CoaSheet[] | null>(null)
  const [sheet, setSheet] = useState("")
  const [parsed, setParsed] = useState<ParsedCoa | null>(null)
  const [withUpdates, setWithUpdates] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function load(f: File | undefined) {
    setSheets(null)
    setSheet("")
    setParsed(null)
    setError(null)
    if (!f) return
    setFile(f.name)
    try {
      const all = await readCoa(f)
      setSheets(all)
      // A workbook with several sheets: the user picks one first.
      if (all.length === 1) choose(all[0].name, all)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  function choose(name: string, all = sheets) {
    setSheet(name)
    setParsed(null)
    setError(null)
    const found = all?.find((s) => s.name === name)
    if (!found) return
    const result = buildCoa(found.cells, accounts)
    if (!result.rows.length) return setError(`Tidak ada nomor akun 6 digit di kolom A sheet "${name}".`)
    setParsed(result)
  }

  const rows = parsed?.rows ?? []
  const count = (status: "new" | "update" | "same") => rows.filter((r) => !r.error && r.status === status).length
  const ready = rows.filter((r) => !r.error && (r.status === "new" || (withUpdates && r.status === "update")))

  async function save() {
    setSaving(true)
    setError(null)
    let saved = 0
    try {
      for (let i = 0; i < ready.length; i += CHUNK) saved += await saveCoa(ready.slice(i, i + CHUNK))
      toast.success(`${saved} akun dari sheet ${sheet} disimpan ke Daftar akun.`)
      onDone()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (saved) toast.success(`${saved} akun sudah tersimpan sebelum gagal.`)
      setError(saved ? `${message} ${saved} akun pertama sudah tersimpan; import lagi untuk sisanya.` : message)
    }
    setSaving(false)
  }

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <DialogHeader>
        <DialogTitle>Import daftar akun</DialogTitle>
        <DialogDescription>
          Format COA seperti file asli, tanpa baris header. Baris tanpa nomor adalah judul grup untuk akun di bawahnya. Tipe dan saldo normal ditebak
          dari digit pertama nomor; baris laporan diisi nanti. Akun yang sudah ada hanya diperbarui nama dan grupnya.
        </DialogDescription>
      </DialogHeader>

      <TemplatePreview />

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" onClick={() => downloadCoaTemplate().catch((err) => toast.error(err.message))}>
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
          <SimpleSelect
            id="sheet"
            value={sheet}
            onChange={(name) => choose(name)}
            required
            placeholder="Pilih sheet"
            options={sheets.map((s) => {
              const n = countAccounts(s)
              return { value: s.name, label: n ? `${s.name} · ${n} akun` : `${s.name} · tidak ada nomor akun` }
            })}
          />
        </Field>
      )}

      {parsed && (
        <>
          {parsed.skipped.length > 0 && (
            <details className="text-sm text-muted-foreground">
              <summary>{parsed.skipped.length} baris dilewati</summary>
              <ul className="mt-1 list-inside list-disc">
                {parsed.skipped.map((s) => (
                  <li key={s.row}>
                    Baris {s.row}: {s.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <DataTable
            columns={[
              { header: "Baris", cell: (r) => r.row, className: "tabular-nums" },
              { header: "Nomor", cell: (r) => <span className="font-medium tabular-nums">{r.code}</span> },
              {
                header: "Nama",
                cell: (r) => (
                  <div className="whitespace-normal">
                    <div className="font-medium">{r.nameId}</div>
                    {r.nameEn !== r.nameId && <div className="text-xs text-muted-foreground">{r.nameEn}</div>}
                  </div>
                ),
              },
              {
                header: "Grup",
                cell: (r) => (
                  <div className="whitespace-normal">
                    <div>{r.group || "—"}</div>
                    {r.accountGroup !== r.group && <div className="text-xs text-muted-foreground">{r.accountGroup}</div>}
                  </div>
                ),
                className: "hidden md:table-cell",
              },
              { header: "Tipe", cell: (r) => (r.type ? ACCOUNT_TYPES[r.type].label : "—") },
              {
                header: "Status",
                cell: (r) => (
                  <div className="flex flex-col items-start gap-1 text-xs whitespace-normal">
                    {r.error ? (
                      <span className="text-destructive">{r.error}</span>
                    ) : r.status === "new" ? (
                      <Badge variant="success">Baru</Badge>
                    ) : r.status === "update" ? (
                      <Badge variant="brand" title={r.changes.join(", ")}>
                        Diperbarui: {r.changes.join(", ")}
                      </Badge>
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
                className: "max-w-64",
              },
            ]}
            data={rows.map((r) => ({ ...r, id: String(r.row) }))}
            loading={false}
            error={null}
            empty="Tidak ada akun."
            rowClassName={(r) => (ready.some((x) => x.row === r.row) ? undefined : "text-muted-foreground")}
          />
          {count("update") > 0 && (
            <Field orientation="horizontal" className="w-auto">
              <Checkbox id="updates" checked={withUpdates} onCheckedChange={setWithUpdates} />
              <FieldLabel htmlFor="updates">Perbarui nama dan grup {count("update")} akun yang sudah ada</FieldLabel>
            </Field>
          )}
          <p className="text-sm">
            {count("new")} akun baru · {count("update")} berbeda dengan yang tersimpan · {count("same")} sudah sama
            {rows.some((r) => r.error) && <> · {rows.filter((r) => r.error).length} bermasalah (tidak disimpan)</>}
          </p>
          <Button className="w-fit" onClick={save} disabled={saving || !ready.length}>
            {saving ? "Menyimpan…" : `Simpan ${ready.length} akun`}
          </Button>
        </>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}

/** The expected sheet, laid out like the client's COA: column letters, row numbers, bold = group heading. */
function TemplatePreview() {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="overflow-x-auto rounded-md border">
        <table className="w-max border-collapse text-xs">
          <thead>
            <tr className="bg-muted text-muted-foreground">
              <th className="w-8 border-r border-b" />
              {COA_COLUMNS.map((c) => (
                <th key={c.col} className="border-r border-b px-2 py-0.5 font-normal last:border-r-0">
                  {c.col} · <span className={cn(c.required && "font-semibold text-foreground")}>{c.label}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {COA_EXAMPLE.map((r, i) => (
              <tr key={i} className={cn(r[0] == null && "bg-muted/60 font-semibold")}>
                <td className="border-r border-b bg-muted px-2 py-1 text-center font-normal text-muted-foreground">{i + 1}</td>
                {r.map((value, j) => (
                  <td key={j} className="min-w-24 border-r border-b px-2 py-1 whitespace-nowrap last:border-r-0">
                    {value == null ? "" : String(value)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Tanpa baris header. Baris tanpa nomor (tebal) = judul grup: B Inggris, C Indonesia. Kalau nama Indonesia kosong, nama Inggris yang dipakai.
      </p>
    </div>
  )
}
