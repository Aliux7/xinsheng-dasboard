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
import { round2, saveBankRows, type Bank, type BankTransaction, type NewBankRow } from "@/lib/bank-book"
import {
  TEMPLATE_COLUMNS,
  buildBook,
  downloadTemplate,
  isBankBook,
  readBook,
  sheetMentions,
  templateRows,
  type BookRow,
  type BookSheet,
  type ParsedBook,
} from "@/lib/bank-import"
import { cn, formatDay, formatNumber } from "@/lib/utils"

type Row = BookRow & { id: string; key: string; first: boolean }

/** Rows per transaction: each row is a document and a log entry; Firestore allows 500 writes. */
const CHUNK = 150

/** BANK BOOK workbook → pick one sheet → preview → its rows into this bank's Buku bank. */
export function BankImport({ bank, book, onDone }: { bank: Bank; book: BankTransaction[]; onDone: () => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState("")
  const [sheets, setSheets] = useState<BookSheet[] | null>(null)
  const [sheet, setSheet] = useState("")
  const [parsed, setParsed] = useState<ParsedBook | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [withOpening, setWithOpening] = useState(false)
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
      const all = await readBook(f)
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
    const result = buildBook(found.cells, book)
    if (!result) return setError(`Sheet "${name}" bukan format buku bank (perlu header Date, Debet dan Credit).`)
    if (!result.vouchers.length && !result.opening) return setError(`Tidak ada baris mutasi di sheet "${name}".`)
    setParsed(result)
    setPicked(new Set(result.vouchers.filter((v) => !v.error && !v.duplicate).map((v) => v.key)))
    // Offer the Beginning Balance while the book has nothing up to that date.
    const start = result.opening
    setWithOpening(!!start?.date && start.balance !== 0 && !book.some((r) => r.date <= start.date))
  }

  const vouchers = parsed?.vouchers ?? []
  const opening = parsed?.opening ?? null
  const ready = vouchers.filter((v) => picked.has(v.key) && !v.error)
  const sum = (sign: 1 | -1) => round2(ready.flatMap((v) => v.rows).reduce((s, r) => s + (sign * r.amount > 0 ? Math.abs(r.amount) : 0), 0))
  const bookBefore = opening?.date ? round2(book.filter((r) => r.date < opening.date).reduce((s, r) => s + r.amount, 0)) : null

  async function save() {
    setSaving(true)
    setError(null)
    const origin = (row: number) => ({ kind: "import" as const, file, sheet, row })
    const toRow = (r: BookRow): NewBankRow => ({
      date: r.date,
      name: r.name,
      description: r.description || r.name,
      descriptionZh: r.descriptionZh,
      note: r.remarks,
      amount: r.amount,
      opening: false,
      origin: origin(r.row),
    })
    const groups = [
      ...(withOpening && opening
        ? [{ number: "", rows: [{ date: opening.date, name: "", description: "Saldo awal (Beginning Balance)", descriptionZh: "", note: "", amount: opening.balance, opening: true, origin: origin(opening.row) }] }]
        : []),
      // The sheet's own numbers first, so automatic numbers continue after them.
      ...[...ready.filter((v) => v.number), ...ready.filter((v) => !v.number)].map((v) => ({ number: v.number, rows: v.rows.map(toRow) })),
    ]
    let saved = 0
    try {
      for (let i = 0; i < groups.length; ) {
        let size = 0
        let j = i
        while (j < groups.length && (size === 0 || size + groups[j].rows.length <= CHUNK)) size += groups[j++].rows.length
        saved += await saveBankRows(bank.id, groups.slice(i, j))
        i = j
      }
      toast.success(`${saved} baris dari sheet ${sheet} disimpan ke buku bank ${bank.name}.`)
      onDone()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (saved) toast.success(`${saved} baris sudah tersimpan sebelum gagal.`)
      setError(saved ? `${message} ${saved} baris pertama sudah tersimpan; import lagi untuk sisanya (yang sudah ada akan ditandai).` : message)
    }
    setSaving(false)
  }

  const rows: Row[] = vouchers.flatMap((v) => v.rows.map((r, i) => ({ ...r, id: String(r.row), key: v.key, first: i === 0, voucher: v.number || r.voucher })))
  const byKey = new Map(vouchers.map((v) => [v.key, v]))
  const toggle = (key: string, on: boolean) =>
    setPicked((p) => {
      const next = new Set(p)
      if (on) next.add(key)
      else next.delete(key)
      return next
    })

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <DialogHeader>
        <DialogTitle>Import buku bank {bank.name}</DialogTitle>
        <DialogDescription>
          Format BANK BOOK seperti file asli: satu sheet = satu rekening. Kalau file punya banyak sheet, pilih sheet-nya dulu. Baris Beginning Balance
          menjadi saldo awal (opsional), baris Sub Total dilewati, dan baris berurutan dengan Voucher/GL No. yang sama menjadi satu voucher dengan
          nomor itu.
        </DialogDescription>
      </DialogHeader>

      <TemplatePreview bank={bank} />

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" onClick={() => downloadTemplate(bank).catch((err) => toast.error(err.message))}>
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
            options={sheets.map((s) => ({
              value: s.name,
              label: !isBankBook(s)
                ? `${s.name} · bukan format buku bank`
                : sheetMentions(s, bank.accountNo)
                  ? `${s.name} · cocok dengan rekening ${bank.accountNo}`
                  : s.name,
            }))}
          />
        </Field>
      )}

      {parsed && (
        <>
          {opening && (
            <div className="flex flex-col gap-2 text-sm">
              <p className={bookBefore !== opening.balance && !withOpening ? "text-destructive" : "text-muted-foreground"}>
                Beginning Balance di sheet (baris {opening.row}
                {opening.date && `, ${formatDay(opening.date)}`}): <strong>{formatNumber(opening.balance)}</strong> · saldo buku bank sebelum tanggal itu:{" "}
                <strong>{formatNumber(bookBefore ?? 0)}</strong>
              </p>
              {!!opening.date && opening.balance !== 0 && (
                <Field orientation="horizontal" className="w-auto">
                  <Checkbox id="opening" checked={withOpening} onCheckedChange={setWithOpening} />
                  <FieldLabel htmlFor="opening">Catat Beginning Balance sebagai saldo awal ({formatNumber(opening.balance)})</FieldLabel>
                </Field>
              )}
            </div>
          )}
          {parsed.skipped.length > 0 && (
            <details className="text-sm text-muted-foreground">
              <summary>{parsed.skipped.length} baris dilewati karena Debet dan Credit kosong</summary>
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
              {
                header: "",
                cell: (r) =>
                  r.first && (
                    <Checkbox
                      checked={picked.has(r.key)}
                      disabled={!!byKey.get(r.key)?.error}
                      onCheckedChange={(on) => toggle(r.key, on)}
                      aria-label={`Voucher ${r.voucher || r.row}`}
                    />
                  ),
              },
              { header: "Baris", cell: (r) => r.row, className: "tabular-nums" },
              { header: "Voucher", cell: (r) => (r.first ? r.voucher || "—" : ""), className: "whitespace-nowrap" },
              { header: "Tanggal", cell: (r) => (r.date ? formatDay(r.date) : "—") },
              {
                header: "Keterangan",
                cell: (r) => (
                  <span className="whitespace-normal">
                    {r.name && <span className="font-medium">{r.name} · </span>}
                    {r.description}
                    {r.descriptionZh && <span className="text-muted-foreground"> {r.descriptionZh}</span>}
                    {r.remarks && <span className="text-muted-foreground"> ({r.remarks})</span>}
                  </span>
                ),
              },
              { header: "Debet", cell: (r) => (r.amount > 0 ? formatNumber(r.amount) : ""), className: "text-right tabular-nums text-success" },
              { header: "Credit", cell: (r) => (r.amount < 0 ? formatNumber(-r.amount) : ""), className: "text-right tabular-nums" },
              {
                header: "Status",
                cell: (r) => {
                  const v = byKey.get(r.key)!
                  const problem = r.error ?? (r.first ? v.error : undefined)
                  const notes = [...(r.first ? v.warnings : []), ...r.warnings]
                  return (
                    <div className="flex flex-col items-start gap-1 text-xs whitespace-normal">
                      {problem ? (
                        <span className="text-destructive">{problem}</span>
                      ) : r.first && v.duplicate ? (
                        <Badge variant="warning" title={v.duplicate}>
                          Mungkin sudah ada
                        </Badge>
                      ) : (
                        r.first && <Badge variant="success">Siap</Badge>
                      )}
                      {notes.map((n) => (
                        <span key={n} className="text-warning">
                          {n}
                        </span>
                      ))}
                    </div>
                  )
                },
                className: "max-w-64",
              },
            ]}
            data={rows}
            loading={false}
            error={null}
            empty="Tidak ada baris mutasi."
            rowClassName={(r) => (picked.has(r.key) ? undefined : "text-muted-foreground")}
          />
          <p className="text-sm">
            {ready.length} dari {vouchers.length} voucher akan disimpan · masuk <strong>{formatNumber(sum(1))}</strong> · keluar{" "}
            <strong>{formatNumber(sum(-1))}</strong>
            {withOpening && opening && (
              <>
                {" "}
                · saldo awal <strong>{formatNumber(opening.balance)}</strong>
              </>
            )}
          </p>
          <Button className="w-fit" onClick={save} disabled={saving || (!ready.length && !withOpening)}>
            {saving ? "Menyimpan…" : `Simpan ${ready.length} voucher ke buku bank`}
          </Button>
        </>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}

/** The expected sheet, laid out like the client's BANK BOOK: column letters, row numbers, bold = must be filled, grey = not read. */
function TemplatePreview({ bank }: { bank: Bank }) {
  const rows = templateRows(bank)
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="overflow-x-auto rounded-md border">
        <table className="w-max border-collapse text-xs">
          <thead>
            <tr className="bg-muted text-muted-foreground">
              <th className="w-8 border-r border-b" />
              {TEMPLATE_COLUMNS.map((c) => (
                <th key={c.col} className="border-r border-b px-2 py-0.5 font-normal last:border-r-0">
                  {c.col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className={cn(i >= 4 && "text-muted-foreground italic")}>
                <td className="border-r border-b bg-muted px-2 py-1 text-center text-muted-foreground">{i + 1}</td>
                {r.map((value, j) => {
                  const c = TEMPLATE_COLUMNS[j]
                  return (
                    <td
                      key={c.col}
                      className={cn(
                        "border-r border-b px-2 py-1 whitespace-nowrap last:border-r-0",
                        (i === 2 || i === 3) && (c.read ? "font-semibold" : ""),
                        (i === 2 || i === 3) && "required" in c && c.required && "bg-black text-white",
                        !c.read && i >= 2 && "text-muted-foreground/60"
                      )}
                    >
                      {value}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Header hitam wajib diisi (Date, Descriptions, Debet/Credit). Kolom A, B dan K tidak dibaca. Baris 5 = Beginning Balance, baris 6 = contoh
        transaksi. Kolom dicari dari nama header, jadi urutan kolom yang sedikit berbeda tetap terbaca.
      </p>
    </div>
  )
}
