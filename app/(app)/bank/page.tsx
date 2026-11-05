"use client"

import { Suspense, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { LandmarkIcon, PencilIcon, Trash2Icon, UploadIcon } from "lucide-react"
import { toast } from "sonner"

import { BankImport } from "@/components/bank-import"
import { DataTable, type Column } from "@/components/data-table"
import { MonthPicker } from "@/components/month-picker"
import { NumberInput } from "@/components/number-input"
import { SimpleSelect } from "@/components/simple-select"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useCollection } from "@/hooks/use-collection"
import { updateRecord } from "@/lib/db"
import {
  BANKS,
  BANK_TRANSACTIONS,
  addBank,
  bankLabel,
  deleteBankRow,
  round2,
  saveBankRow,
  sortBook,
  updateBankRow,
  type Bank,
  type BankTransaction,
} from "@/lib/bank-book"
import { formatDay, formatNumber, today } from "@/lib/utils"

type Row = BankTransaction & { balance: number; total?: string }

const DIRECTIONS = [
  { value: "in", label: "Masuk (Debet)" },
  { value: "out", label: "Keluar (Credit)" },
]

export default function BankPage() {
  // ?bank= needs a Suspense boundary with cacheComponents.
  return (
    <Suspense>
      <BankBook />
    </Suspense>
  )
}

function BankBook() {
  const router = useRouter()
  const banks = useCollection<Bank>(BANKS, { orderBy: "name" })
  const active = banks.data.filter((b) => b.active)
  const bankId = useSearchParams().get("bank") ?? active[0]?.id ?? ""
  const bank = banks.data.find((b) => b.id === bankId)
  const rows = useCollection<BankTransaction>(BANK_TRANSACTIONS, { where: [["bank", "==", bankId]], skip: !bankId })
  const [month, setMonth] = useState(() => today().slice(0, 7))
  const [editing, setEditing] = useState<BankTransaction | null>(null)
  const [importing, setImporting] = useState(false)
  const [managing, setManaging] = useState(false)

  const book = sortBook(rows.data)
  const inMonth = (r: BankTransaction) => !month || r.date.startsWith(month)
  const opening = round2(book.filter((r) => month && r.date < `${month}-01`).reduce((s, r) => s + r.amount, 0))
  const shown = book.filter(inMonth).reduce<Row[]>((acc, r) => [...acc, { ...r, balance: round2((acc.at(-1)?.balance ?? opening) + r.amount) }], [])
  const closing = shown.at(-1)?.balance ?? opening
  const totalRow = (label: string, balance: number) => ({ ...({} as BankTransaction), id: label, total: label, balance })

  const columns: Column<Row>[] = [
    { header: "Tanggal", cell: (r) => (r.total ? "" : formatDay(r.date)) },
    {
      header: "No. bukti",
      cell: (r) =>
        r.total || r.number ? (
          <span className="flex flex-col items-start gap-1 font-medium whitespace-nowrap">
            {r.total ?? r.number}
            {!r.total && r.journal && <Badge variant="success">Dijurnal</Badge>}
          </span>
        ) : (
          <Badge variant="brand">Saldo awal</Badge>
        ),
    },
    { header: "Nama", cell: (r) => r.name, className: "hidden md:table-cell" },
    {
      header: "Keterangan",
      cell: (r) => (
        <span className="whitespace-normal">
          {r.description}
          {r.descriptionZh && <span className="text-muted-foreground"> {r.descriptionZh}</span>}
          {r.note && <span className="text-muted-foreground"> ({r.note})</span>}
        </span>
      ),
    },
    { header: "Masuk (Rp)", cell: (r) => (!r.total && r.amount > 0 ? formatNumber(r.amount) : ""), className: "text-right tabular-nums text-success" },
    { header: "Keluar (Rp)", cell: (r) => (!r.total && r.amount < 0 ? formatNumber(-r.amount) : ""), className: "text-right tabular-nums" },
    { header: "Saldo", cell: (r) => formatNumber(r.balance), className: "text-right font-medium tabular-nums" },
    {
      header: "",
      cell: (r) =>
        !r.total && (
          <Button size="sm" variant="outline" onClick={() => setEditing(r)} aria-label={`Ubah ${r.number || "saldo awal"}`}>
            <PencilIcon />
            Ubah
          </Button>
        ),
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-full sm:w-72">
          <SimpleSelect
            id="bank"
            value={bankId}
            onChange={(b) => router.replace(`/bank?bank=${b}`)}
            placeholder={banks.loading ? "Memuat…" : "Belum ada rekening"}
            options={banks.data.filter((b) => b.active || b.id === bankId).map((b) => ({ value: b.id, label: bankLabel(b) }))}
          />
        </div>
        <MonthPicker month={month} onChange={setMonth} />
        <Button variant="outline" className="ml-auto" onClick={() => setImporting(true)} disabled={!bank?.active || rows.loading}>
          <UploadIcon />
          Import buku bank
        </Button>
        <Button variant="outline" onClick={() => setManaging(true)}>
          <LandmarkIcon />
          Rekening bank
        </Button>
      </div>

      {bank?.active && <QuickEntry bank={bank.id} />}
      {!banks.loading && !active.length && <p className="text-sm text-muted-foreground">Tambahkan rekening bank dulu lewat tombol Rekening bank.</p>}

      <DataTable
        columns={columns}
        data={bankId ? [totalRow("Saldo awal", opening), ...shown, totalRow("Saldo akhir", closing)] : []}
        loading={rows.loading}
        error={rows.error}
        empty="Pilih rekening bank."
        rowClassName={(r) => (r.total ? "bg-brand-soft/60 font-medium text-brand" : undefined)}
      />

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-lg">{editing && <EditRow row={editing} onDone={() => setEditing(null)} />}</DialogContent>
      </Dialog>
      <Dialog open={importing} onOpenChange={setImporting}>
        <DialogContent className="sm:max-w-6xl">{importing && bank && <BankImport bank={bank} book={rows.data} onDone={() => setImporting(false)} />}</DialogContent>
      </Dialog>
      <Dialog open={managing} onOpenChange={setManaging}>
        <DialogContent className="sm:max-w-2xl">{managing && <Banks banks={banks.data} />}</DialogContent>
      </Dialog>
    </div>
  )
}

/** One row of money in or out; gets the next BBM/BBK number. */
function QuickEntry({ bank }: { bank: string }) {
  const [date, setDate] = useState(today)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [direction, setDirection] = useState("out")
  const [amount, setAmount] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!amount || amount <= 0) return setError("Jumlah harus lebih dari 0.")
    setError(null)
    setSaving(true)
    try {
      const number = await saveBankRow(bank, { date, name: name.trim(), description: description.trim(), amount: direction === "in" ? amount : -amount })
      toast.success(`${number} disimpan.`)
      setName("")
      setDescription("")
      setAmount(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
    setSaving(false)
  }

  return (
    <form onSubmit={submit} className="grid gap-3 rounded-xl border p-3 sm:grid-cols-12">
      <Input className="sm:col-span-2" type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Tanggal" required />
      <Input className="sm:col-span-3" placeholder="Nama" value={name} onChange={(e) => setName(e.target.value)} aria-label="Nama" />
      <Input className="sm:col-span-4" placeholder="Keterangan" value={description} onChange={(e) => setDescription(e.target.value)} aria-label="Keterangan" required />
      <div className="sm:col-span-3">
        <SimpleSelect id="direction" value={direction} onChange={setDirection} options={DIRECTIONS} />
      </div>
      <NumberInput className="sm:col-span-3" placeholder="Jumlah (Rp)" value={amount} onChange={setAmount} aria-label="Jumlah" required />
      <Button type="submit" className="sm:col-span-2" disabled={saving}>
        {saving ? "Menyimpan…" : "Simpan"}
      </Button>
      {error && <FieldError className="sm:col-span-7">{error}</FieldError>}
    </form>
  )
}

/** Edits or deletes a row; its number stays. */
function EditRow({ row, onDone }: { row: BankTransaction; onDone: () => void }) {
  const [date, setDate] = useState(row.date)
  const [name, setName] = useState(row.name)
  const [description, setDescription] = useState(row.description)
  const [descriptionZh, setDescriptionZh] = useState(row.descriptionZh)
  const [note, setNote] = useState(row.note)
  const [direction, setDirection] = useState(row.amount > 0 ? "in" : "out")
  const [amount, setAmount] = useState<number | null>(Math.abs(row.amount))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const label = row.number || "Saldo awal"

  async function run(action: () => Promise<unknown>, done: string) {
    setBusy(true)
    try {
      await action()
      toast.success(done)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
    setBusy(false)
  }

  function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!amount || amount <= 0) return setError("Jumlah harus lebih dari 0.")
    const patch = { date, name: name.trim(), description: description.trim(), descriptionZh: descriptionZh.trim(), note: note.trim(), amount: direction === "in" ? amount : -amount }
    run(() => updateBankRow(row.id, patch), `${label} diubah.`)
  }

  return (
    <form onSubmit={submit}>
      <DialogHeader>
        <DialogTitle>Ubah {label}</DialogTitle>
      </DialogHeader>
      {row.journal && (
        <p className="mt-4 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">
          Baris ini sudah dijurnal, jadi tidak bisa diubah atau dihapus. Batalkan jurnalnya dulu di Jurnal buku bank.
        </p>
      )}
      <div className="my-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="edate">Tanggal</FieldLabel>
          <Input id="edate" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>
        <Field>
          <FieldLabel htmlFor="ename">Nama</FieldLabel>
          <Input id="ename" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field className="sm:col-span-2">
          <FieldLabel htmlFor="edesc">Keterangan</FieldLabel>
          <Input id="edesc" value={description} onChange={(e) => setDescription(e.target.value)} required />
        </Field>
        <Field className="sm:col-span-2">
          <FieldLabel htmlFor="ezh">Keterangan (Mandarin)</FieldLabel>
          <Input id="ezh" value={descriptionZh} onChange={(e) => setDescriptionZh(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="edir">Arah</FieldLabel>
          <SimpleSelect id="edir" value={direction} onChange={setDirection} options={DIRECTIONS} required />
        </Field>
        <Field>
          <FieldLabel htmlFor="eamount">Jumlah (Rp)</FieldLabel>
          <NumberInput id="eamount" value={amount} onChange={setAmount} required />
        </Field>
        <Field className="sm:col-span-2">
          <FieldLabel htmlFor="enote">Catatan</FieldLabel>
          <Input id="enote" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {error && <FieldError className="sm:col-span-2">{error}</FieldError>}
      </div>
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          className="sm:mr-auto"
          disabled={busy || !!row.journal}
          onClick={() => confirm(`Hapus ${label} (${row.description}) dari buku bank?`) && run(() => deleteBankRow(row.id), `${label} dihapus.`)}
        >
          <Trash2Icon />
          Hapus
        </Button>
        <DialogClose render={<Button variant="outline" type="button" />}>Batal</DialogClose>
        <Button type="submit" disabled={busy || !!row.journal}>
          Simpan
        </Button>
      </DialogFooter>
    </form>
  )
}

/** Own bank accounts: add, edit name / account no., (de)activate. */
function Banks({ banks }: { banks: Bank[] }) {
  const [editing, setEditing] = useState<Bank | null>(null)
  const [name, setName] = useState("")
  const [accountNo, setAccountNo] = useState("")
  const [error, setError] = useState<string | null>(null)

  const reset = (b: Bank | null = null) => {
    setEditing(b)
    setName(b?.name ?? "")
    setAccountNo(b?.accountNo ?? "")
    setError(null)
  }

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    const data = { name: name.trim(), accountNo: accountNo.trim() }
    try {
      if (editing) await updateRecord(BANKS, editing.id, data)
      else await addBank({ ...data, active: true })
      toast.success(`Rekening ${data.name} ${editing ? "diubah" : "ditambahkan"}.`)
      reset()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const toggle = (b: Bank) =>
    updateRecord(BANKS, b.id, { active: !b.active })
      .then(() => toast.success(`${b.name} ${b.active ? "dinonaktifkan" : "diaktifkan"}.`))
      .catch((err) => toast.error(err.message))

  return (
    <div className="flex flex-col gap-5">
      <DialogHeader>
        <DialogTitle>Rekening bank</DialogTitle>
      </DialogHeader>
      <DataTable
        columns={[
          { header: "Nama", cell: (b) => <span className="font-medium">{b.name}</span> },
          { header: "No. rekening", cell: (b) => b.accountNo || <span className="text-destructive">Belum diisi</span> },
          {
            header: "",
            cell: (b) => (
              <div className="flex justify-end gap-1">
                <Button size="sm" variant="ghost" onClick={() => reset(b)}>
                  Ubah
                </Button>
                <Button size="sm" variant="ghost" onClick={() => toggle(b)}>
                  {b.active ? "Nonaktifkan" : "Aktifkan"}
                </Button>
              </div>
            ),
          },
        ]}
        data={banks}
        loading={false}
        error={null}
        empty="Belum ada rekening."
        rowClassName={(b) => (b.active ? undefined : "text-muted-foreground")}
      />
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-3">
        <Field>
          <FieldLabel htmlFor="bname">Nama</FieldLabel>
          <Input id="bname" value={name} onChange={(e) => setName(e.target.value)} placeholder="BCA PT" required />
        </Field>
        <Field>
          <FieldLabel htmlFor="bno">No. rekening</FieldLabel>
          <Input id="bno" value={accountNo} onChange={(e) => setAccountNo(e.target.value)} placeholder="5060552098" required />
        </Field>
        <div className="flex gap-2 self-end">
          <Button type="submit">{editing ? "Simpan" : "Tambah"}</Button>
          {editing && (
            <Button type="button" variant="outline" onClick={() => reset()}>
              Batal
            </Button>
          )}
        </div>
        {error && <FieldError className="sm:col-span-3">{error}</FieldError>}
      </form>
      <p className="text-xs text-muted-foreground">No. rekening dipakai untuk mengenali sheet BANK BOOK yang cocok saat import.</p>
    </div>
  )
}
