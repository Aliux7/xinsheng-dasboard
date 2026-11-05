"use client"

import { useState } from "react"
import { ListPlusIcon, PencilIcon, PlusIcon } from "lucide-react"
import { toast } from "sonner"

import { DataTable, type Column } from "@/components/data-table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useCollection } from "@/hooks/use-collection"
import { ACCOUNTS, type Account } from "@/lib/accounts"
import { REPORT_LINES, STANDARD_REPORT_LINES, addStandardReportLines, saveReportLine, statementOf, type ReportLine } from "@/lib/report-lines"

export default function ReportLinesPage() {
  const lines = useCollection<ReportLine>(REPORT_LINES, { orderBy: "code" })
  const accounts = useCollection<Account>(ACCOUNTS)
  const [search, setSearch] = useState("")
  const [showInactive, setShowInactive] = useState(false)
  const [editing, setEditing] = useState<ReportLine | "new" | null>(null)
  const [busy, setBusy] = useState(false)

  const used = new Map<string, number>()
  for (const a of accounts.data) if (a.reportLine) used.set(a.reportLine, (used.get(a.reportLine) ?? 0) + 1)
  const existing = new Set(lines.data.map((l) => l.code))
  const missing = STANDARD_REPORT_LINES.filter(([code]) => !existing.has(code)).length

  const q = search.trim().toLowerCase()
  // Neraca first, then Laba rugi, each by number.
  const shown = lines.data
    .filter((l) => (showInactive || l.active) && (!q || [l.code, l.name].some((v) => v?.toLowerCase().includes(q))))
    .sort((a, b) => b.code.slice(0, 2).localeCompare(a.code.slice(0, 2)) || a.code.localeCompare(b.code, undefined, { numeric: true }))

  async function addStandard() {
    setBusy(true)
    try {
      const n = await addStandardReportLines()
      toast.success(`${n} baris laporan standar ditambahkan.`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
    setBusy(false)
  }

  const columns: Column<ReportLine>[] = [
    { header: "Kode", cell: (l) => <span className="font-medium">{l.code}</span> },
    { header: "Nama", cell: (l) => (l.name && l.name !== l.code ? l.name : <span className="text-muted-foreground">Belum diberi nama</span>) },
    { header: "Jumlah akun", cell: (l) => used.get(l.code) ?? 0, className: "text-right tabular-nums" },
    { header: "Status", cell: (l) => !l.active && <Badge variant="outline">Nonaktif</Badge> },
    {
      header: "",
      cell: (l) => (
        <Button size="sm" variant="outline" onClick={() => setEditing(l)} aria-label={`Ubah ${l.code}`}>
          <PencilIcon />
          Ubah
        </Button>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input className="w-full sm:w-72" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari kode atau nama…" aria-label="Cari baris laporan" />
        <Field orientation="horizontal" className="w-auto">
          <Checkbox id="inactive" checked={showInactive} onCheckedChange={setShowInactive} />
          <FieldLabel htmlFor="inactive">Tampilkan nonaktif</FieldLabel>
        </Field>
        <span className="text-sm text-muted-foreground">{shown.length} baris</span>
        {!lines.loading && missing > 0 && (
          <Button variant="outline" className="ml-auto" onClick={addStandard} disabled={busy}>
            <ListPlusIcon />
            Tambah {missing} baris standar
          </Button>
        )}
        <Button className={missing > 0 && !lines.loading ? undefined : "ml-auto"} onClick={() => setEditing("new")}>
          <PlusIcon />
          Tambah baris
        </Button>
      </div>

      <DataTable
        columns={columns}
        {...lines}
        data={shown}
        empty={lines.data.length ? "Tidak ada baris yang cocok." : "Belum ada baris laporan. Klik Tambah baris standar untuk mengisi daftar NERACA dan LABARUGI."}
        groupBy={(l) => statementOf(l.code) || "Lainnya"}
        rowClassName={(l) => (l.active ? undefined : "text-muted-foreground")}
      />
      <p className="text-xs text-muted-foreground">
        Baris laporan menentukan di baris mana sebuah akun muncul pada Neraca (NR..) atau Laba rugi (LR..). Beberapa akun boleh memakai baris yang sama;
        nilainya dijumlahkan.
      </p>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          {editing && <LineForm line={editing === "new" ? null : editing} taken={existing} onDone={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** Add (line = null) or edit; the code is locked once saved. */
function LineForm({ line, taken, onDone }: { line: ReportLine | null; taken: Set<string>; onDone: () => void }) {
  const [code, setCode] = useState(line?.code ?? "")
  const [name, setName] = useState(line?.name && line.name !== line.code ? line.name : "")
  const [active, setActive] = useState(line?.active !== false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const c = code.trim().toUpperCase()
    if (!line && taken.has(c)) return setError(`Kode ${c} sudah ada.`)
    setError(null)
    setBusy(true)
    try {
      await saveReportLine({ code: c, name, active }, !line)
      toast.success(`Baris laporan ${c} ${line ? "disimpan" : "ditambahkan"}.`)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
    setBusy(false)
  }

  return (
    <form onSubmit={submit}>
      <DialogHeader>
        <DialogTitle>{line ? `Ubah baris ${line.code}` : "Tambah baris laporan"}</DialogTitle>
      </DialogHeader>
      <div className="my-6 flex flex-col gap-4">
        <Field>
          <FieldLabel htmlFor="code">Kode</FieldLabel>
          <Input id="code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="NR01" disabled={!!line} required />
          {!line && <FieldDescription>NR.. = Neraca, LR.. = Laba rugi. Tidak bisa diubah setelah disimpan.</FieldDescription>}
        </Field>
        <Field>
          <FieldLabel htmlFor="name">Nama</FieldLabel>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Kas & bank" required />
        </Field>
        {line && (
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
