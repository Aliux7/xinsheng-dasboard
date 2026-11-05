"use client"

import { useState } from "react"
import { EyeIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { DataTable, type Column } from "@/components/data-table"
import { JournalView } from "@/components/journal-view"
import { MonthPicker } from "@/components/month-picker"
import { NumberInput } from "@/components/number-input"
import { SimpleSelect } from "@/components/simple-select"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useLedger } from "@/hooks/use-ledger"
import type { Account } from "@/lib/accounts"
import { round2 } from "@/lib/bank-book"
import { SOURCE_LABELS, cancelJournal, saveManualJournal, type Journal, type LineInput } from "@/lib/journal"
import { formatDay, formatNumber, today } from "@/lib/utils"

const SOURCES = [{ value: "", label: "Semua sumber" }, ...Object.entries(SOURCE_LABELS).map(([value, label]) => ({ value, label }))]

const CANCEL_NOTE: Record<Journal["source"]["kind"], string> = {
  bank: " Baris buku banknya kembali menjadi belum dijurnal (stok bahan baku yang ikut berubah dibalik).",
  manual: "",
  opening: " Saldo awal semua akun hilang sampai disimpan lagi.",
  cogs: " HPP bulan itu bisa dihitung dan diposting ulang di HPP bulanan.",
}

/** Every journal of a month, from any source; manual journals are added here. */
export default function JournalsPage() {
  const ledger = useLedger()
  const [month, setMonth] = useState(() => today().slice(0, 7))
  const [source, setSource] = useState("")
  const [search, setSearch] = useState("")
  const [viewing, setViewing] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)

  const q = search.trim().toLowerCase()
  const shown = ledger.journals
    .filter((j) => (!month || j.date.startsWith(month)) && (!source || j.source.kind === source))
    .filter((j) => !q || [j.number, j.description, ...j.accounts, ...j.lines.map((l) => l.description)].some((v) => v?.toLowerCase().includes(q)))
    .sort((a, b) => a.date.localeCompare(b.date) || a.number.localeCompare(b.number, undefined, { numeric: true }))
  const total = round2(shown.reduce((s, j) => s + j.total, 0))

  async function cancel(j: Journal) {
    if (!confirm(`Batalkan jurnal ${j.number}?${CANCEL_NOTE[j.source.kind]}`)) return
    setBusy(true)
    try {
      await cancelJournal(j.id)
      toast.success(`Jurnal ${j.number} dibatalkan.`)
      setViewing(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
    setBusy(false)
  }

  const columns: Column<Journal>[] = [
    { header: "Tanggal", cell: (j) => formatDay(j.date) },
    { header: "Nomor", cell: (j) => <span className="font-medium whitespace-nowrap">{j.number}</span> },
    { header: "Sumber", cell: (j) => <Badge variant={j.source.kind === "manual" ? "outline" : "brand"}>{SOURCE_LABELS[j.source.kind]}</Badge> },
    {
      header: "Keterangan",
      cell: (j) => (
        <div className="whitespace-normal">
          <div>{j.description}</div>
          <div className="text-xs text-muted-foreground">{j.accounts.map(ledger.label).join(" · ")}</div>
        </div>
      ),
    },
    { header: "Total", cell: (j) => formatNumber(j.total), className: "text-right tabular-nums" },
    {
      header: "",
      cell: (j) => (
        <Button size="icon-sm" variant="ghost" onClick={() => setViewing(j.id)} aria-label={`Lihat ${j.number}`}>
          <EyeIcon />
        </Button>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <MonthPicker month={month} onChange={setMonth} />
        <div className="w-44">
          <SimpleSelect id="source" value={source} onChange={setSource} options={SOURCES} placeholder="Semua sumber" />
        </div>
        <Input className="w-full sm:w-64" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari nomor, keterangan, akun…" aria-label="Cari jurnal" />
        <span className="text-sm text-muted-foreground">
          {shown.length} jurnal · total {formatNumber(total)}
        </span>
        <Button className="ml-auto" onClick={() => setAdding(true)} disabled={ledger.loading}>
          <PlusIcon />
          Jurnal baru
        </Button>
      </div>
      <DataTable columns={columns} data={shown} loading={ledger.loading} error={ledger.error} empty="Belum ada jurnal bulan ini." />
      <p className="text-xs text-muted-foreground">
        Jurnal tidak bisa diubah; batalkan lalu buat lagi. Jurnal buku bank dibuat di Jurnal buku bank, saldo awal di Saldo awal, HPP di HPP bulanan.
      </p>

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="sm:max-w-3xl">
          {viewing && <JournalView journal={ledger.journals.find((j) => j.id === viewing)} label={ledger.label} busy={busy} onCancel={cancel} />}
        </DialogContent>
      </Dialog>
      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent className="sm:max-w-4xl">{adding && <ManualJournal accounts={ledger.accounts} onDone={() => setAdding(false)} />}</DialogContent>
      </Dialog>
    </div>
  )
}

const emptyLine = (): LineInput => ({ account: "", description: "", debit: null, credit: null })

/** A balanced journal typed by hand (penyusutan, koreksi, transaksi kredit…). */
function ManualJournal({ accounts, onDone }: { accounts: Account[]; onDone: () => void }) {
  const [date, setDate] = useState(today)
  const [description, setDescription] = useState("")
  const [lines, setLines] = useState<LineInput[]>([emptyLine(), emptyLine()])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Inventory accounts move only with the stock (Jurnal buku bank, Saldo awal, HPP bulanan).
  const options = accounts.filter((a) => a.active && !a.link).map((a) => ({ value: a.code, label: `${a.code} · ${a.nameId}` }))
  const set = (i: number, patch: Partial<LineInput>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)))
  const debit = round2(lines.reduce((s, l) => s + (l.debit ?? 0), 0))
  const credit = round2(lines.reduce((s, l) => s + (l.credit ?? 0), 0))

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const number = await saveManualJournal({ date, description, lines })
      toast.success(`Jurnal ${number} disimpan.`)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
    setBusy(false)
  }

  return (
    <form onSubmit={submit} className="flex min-w-0 flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Jurnal baru</DialogTitle>
        <DialogDescription>Nomor JV dibuat otomatis. Debit dan kredit harus sama. Akun persediaan bahan baku tidak bisa dipakai di sini.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field>
          <FieldLabel htmlFor="jdate">Tanggal</FieldLabel>
          <Input id="jdate" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>
        <Field className="sm:col-span-2">
          <FieldLabel htmlFor="jdesc">Keterangan</FieldLabel>
          <Input id="jdesc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Penyusutan mesin November" required />
        </Field>
      </div>
      <div className="flex flex-col gap-2">
        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_8.5rem_8.5rem_auto]">
            <SimpleSelect id={`acc-${i}`} value={l.account} onChange={(account) => set(i, { account })} options={options} placeholder="Pilih akun" />
            <Input value={l.description} onChange={(e) => set(i, { description: e.target.value })} placeholder="Keterangan baris" aria-label="Keterangan baris" />
            <NumberInput value={l.debit} onChange={(debit) => set(i, { debit, ...(debit ? { credit: null } : {}) })} placeholder="Debit" aria-label="Debit" />
            <NumberInput value={l.credit} onChange={(credit) => set(i, { credit, ...(credit ? { debit: null } : {}) })} placeholder="Kredit" aria-label="Kredit" />
            <Button type="button" size="icon-sm" variant="ghost" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} disabled={lines.length <= 2} aria-label="Hapus baris">
              <Trash2Icon />
            </Button>
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" size="sm" variant="outline" onClick={() => setLines((ls) => [...ls, emptyLine()])}>
            <PlusIcon />
            Tambah baris
          </Button>
          <span className={debit === credit ? "text-sm text-muted-foreground" : "text-sm text-warning"}>
            Debit {formatNumber(debit)} · Kredit {formatNumber(credit)}
            {debit !== credit && ` · selisih ${formatNumber(round2(debit - credit))}`}
          </span>
        </div>
      </div>
      {error && <FieldError>{error}</FieldError>}
      <DialogFooter>
        <DialogClose render={<Button variant="outline" type="button" />}>Batal</DialogClose>
        <Button type="submit" disabled={busy || !debit || debit !== credit}>
          {busy ? "Menyimpan…" : "Simpan jurnal"}
        </Button>
      </DialogFooter>
    </form>
  )
}
