"use client"

import { Suspense, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeftRightIcon } from "lucide-react"
import { toast } from "sonner"

import { AccountSelect } from "@/components/account-select"
import { DataTable, type Column } from "@/components/data-table"
import { JournalDialog } from "@/components/journal-view"
import { MonthPicker, useMonth } from "@/components/month-picker"
import { NumberInput } from "@/components/number-input"
import { SimpleSelect } from "@/components/simple-select"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useCollection } from "@/hooks/use-collection"
import { ACCOUNTS, BANKS, BANK_RECS, JOURNALS, type Account, type BankId, type BankRec, type Journal } from "@/lib/collections"
import { bankOf, contraOf, linesOf, reconciliation, round2, saveBankEntry, saveBankRec, saveTransfer, type LedgerLine } from "@/lib/journal"
import { formatDay, formatNumber, monthRange, today } from "@/lib/utils"

type Row = LedgerLine & { id: string; balance: number; total?: string }

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
  const bank = (useSearchParams().get("bank") as BankId | null) ?? "bca1"
  const account = bankOf(bank).account
  const accounts = useCollection<Account>(ACCOUNTS).data
  const journals = useCollection<Journal>(JOURNALS, { where: [["accounts", "array-contains", account]] })
  const { month, setMonth } = useMonth()
  const rec = useCollection<BankRec>(BANK_RECS).data.find((r) => r.id === `${bank}-${month}`)
  const [open, setOpen] = useState<Journal | null>(null)
  const [transfer, setTransfer] = useState(false)

  const [start, end] = month ? monthRange(month) : ["", ""]
  const all = linesOf(journals.data, account)
  const opening = round2(all.filter((l) => l.date < start).reduce((s, l) => s + l.line.debit - l.line.credit, 0))
  const inMonth = all.filter((l) => l.date >= start && l.date < end)
  const rows = inMonth.reduce<Row[]>((acc, l) => [...acc, { ...l, id: l.key, balance: round2((acc.at(-1)?.balance ?? opening) + l.line.debit - l.line.credit) }], [])
  const closing = rows.at(-1)?.balance ?? opening
  const name = (code: string) => accounts.find((a) => a.code === code)?.nameId ?? ""

  const columns: Column<Row>[] = [
    { header: "Tanggal", cell: (r) => (r.total ? "" : formatDay(r.date)) },
    {
      header: "No. bukti",
      cell: (r) =>
        r.total ? (
          <span className="font-medium">{r.total}</span>
        ) : (
          <button type="button" className="font-medium underline-offset-4 hover:underline" onClick={() => setOpen(r.journal)}>
            {r.journal.number || "—"}
          </button>
        ),
    },
    { header: "Nama", cell: (r) => r.journal.counterparty, className: "hidden md:table-cell" },
    { header: "Keterangan", cell: (r) => <span className="whitespace-normal">{r.line.description || r.journal.description}</span> },
    { header: "Akun lawan", cell: (r) => (r.total ? "" : contraOf(r).split(", ").map((c) => `${c} ${name(c)}`).join(", ")), className: "hidden lg:table-cell whitespace-normal" },
    { header: "Masuk", cell: (r) => (r.line.debit ? formatNumber(r.line.debit) : ""), className: "text-right tabular-nums" },
    { header: "Keluar", cell: (r) => (r.line.credit ? formatNumber(r.line.credit) : ""), className: "text-right tabular-nums" },
    { header: "Saldo", cell: (r) => formatNumber(r.balance), className: "text-right font-medium tabular-nums" },
  ]
  const blankLine = { account, description: "", descriptionZh: "", currency: "IDR", amount: null, rate: null, debit: 0, credit: 0, note: "" }
  const totalRow = (label: string, balance: number): Row =>
    ({ id: label, total: label, balance, date: "", index: 0, key: label, line: blankLine, journal: { number: "", counterparty: "", description: "" } as Journal })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-full sm:w-72">
          <SimpleSelect id="bank" value={bank} onChange={(b) => router.replace(`/bank?bank=${b}`)} options={BANKS.map((b) => ({ value: b.id, label: `${b.name} (${b.account})` }))} />
        </div>
        <MonthPicker month={month} setMonth={setMonth} />
        <Button variant="outline" className="ml-auto" onClick={() => setTransfer(true)}>
          <ArrowLeftRightIcon />
          Transfer antar bank
        </Button>
      </div>

      <QuickEntry bank={bank} accounts={accounts} />

      <DataTable
        columns={columns}
        {...journals}
        data={[totalRow("Saldo awal", opening), ...rows, totalRow("Saldo akhir", closing)]}
        rowClassName={(r) => (r.total ? "bg-muted/50 font-medium" : undefined)}
      />

      {month && !journals.loading && (
        <Reconciliation key={`${bank}-${month}-${rec?.statementBalance ?? ""}`} bank={bank} month={month} lines={inMonth} closing={closing} saved={rec} />
      )}

      <JournalDialog journal={open} accounts={accounts} onClose={() => setOpen(null)} />
      <Dialog open={transfer} onOpenChange={setTransfer}>
        <DialogContent>{transfer && <TransferForm from={bank} onDone={() => setTransfer(false)} />}</DialogContent>
      </Dialog>
    </div>
  )
}

/** Money in or out: bank account vs one contra account, as one balanced BBM/BBK entry. */
function QuickEntry({ bank, accounts }: { bank: BankId; accounts: Account[] }) {
  const [date, setDate] = useState(today)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [contra, setContra] = useState("")
  const [direction, setDirection] = useState<"in" | "out">("out")
  const [amount, setAmount] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!contra) return setError("Pilih akun lawan.")
    if (!amount || amount <= 0) return setError("Jumlah harus lebih dari 0.")
    setError(null)
    setSaving(true)
    try {
      const saved = await saveBankEntry({ bank, date, name: name.trim(), description: description.trim(), contra, direction, amount })
      toast.success(`${saved.number} disimpan.`)
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
      <Input className="sm:col-span-2" placeholder="Nama" value={name} onChange={(e) => setName(e.target.value)} />
      <Input className="sm:col-span-3" placeholder="Keterangan" value={description} onChange={(e) => setDescription(e.target.value)} required />
      <div className="sm:col-span-3">
        <AccountSelect value={contra} onChange={setContra} accounts={accounts} placeholder="Akun lawan" required />
      </div>
      <div className="sm:col-span-2">
        <SimpleSelect
          id="direction"
          value={direction}
          onChange={(v) => setDirection(v as "in" | "out")}
          options={[
            { value: "in", label: "Masuk (BBM)" },
            { value: "out", label: "Keluar (BBK)" },
          ]}
        />
      </div>
      <NumberInput className="sm:col-span-3" placeholder="Jumlah (Rp)" value={amount} onChange={setAmount} required />
      <Button type="submit" className="sm:col-span-2" disabled={saving}>
        {saving ? "Menyimpan…" : "Simpan"}
      </Button>
      {error && <FieldError className="sm:col-span-7">{error}</FieldError>}
    </form>
  )
}

function TransferForm({ from: initial, onDone }: { from: BankId; onDone: () => void }) {
  const [from, setFrom] = useState<BankId>(initial)
  const [to, setTo] = useState<BankId>(BANKS.find((b) => b.id !== initial)!.id)
  const [date, setDate] = useState(today)
  const [amount, setAmount] = useState<number | null>(null)
  const [description, setDescription] = useState("")
  const [error, setError] = useState<string | null>(null)
  const options = BANKS.map((b) => ({ value: b.id, label: b.name }))

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!amount || amount <= 0) return setError("Jumlah harus lebih dari 0.")
    try {
      const saved = await saveTransfer({ from, to, date, amount, description: description.trim() })
      toast.success(`Transfer ${saved.number} disimpan.`)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <form onSubmit={submit}>
      <DialogHeader>
        <DialogTitle>Transfer antar bank</DialogTitle>
      </DialogHeader>
      <div className="my-6 grid grid-cols-2 gap-4">
        <Field>
          <FieldLabel htmlFor="from">Dari</FieldLabel>
          <SimpleSelect id="from" value={from} onChange={(v) => setFrom(v as BankId)} options={options} required />
        </Field>
        <Field>
          <FieldLabel htmlFor="to">Ke</FieldLabel>
          <SimpleSelect id="to" value={to} onChange={(v) => setTo(v as BankId)} options={options} required />
        </Field>
        <Field>
          <FieldLabel htmlFor="tdate">Tanggal</FieldLabel>
          <Input id="tdate" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>
        <Field>
          <FieldLabel htmlFor="tamount">Jumlah (Rp)</FieldLabel>
          <NumberInput id="tamount" value={amount} onChange={setAmount} required />
        </Field>
        <Field className="col-span-2">
          <FieldLabel htmlFor="tdesc">Keterangan</FieldLabel>
          <Input id="tdesc" value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        {error && <FieldError className="col-span-2">{error}</FieldError>}
      </div>
      <DialogFooter>
        <DialogClose render={<Button variant="outline" type="button" />}>Batal</DialogClose>
        <Button type="submit">Simpan</Button>
      </DialogFooter>
    </form>
  )
}

/** Monthly reconciliation: statement closing balance + ticked (cleared) lines → difference. */
function Reconciliation({ bank, month, lines, closing, saved }: { bank: BankId; month: string; lines: LedgerLine[]; closing: number; saved?: BankRec }) {
  const [statement, setStatement] = useState<number | null>(saved?.statementBalance ?? null)
  const [cleared, setCleared] = useState<Set<string>>(new Set(saved?.cleared ?? []))
  const [busy, setBusy] = useState(false)
  const { unclearedIn, unclearedOut, difference } = reconciliation(lines, closing, statement, cleared)

  const toggle = (key: string, on: boolean) =>
    setCleared((s) => {
      const next = new Set(s)
      if (on) next.add(key)
      else next.delete(key)
      return next
    })

  async function save() {
    setBusy(true)
    await saveBankRec({ bank, month, statementBalance: statement, cleared: [...cleared], difference: difference ?? 0, reconciled: difference === 0 })
      .then(() => toast.success(difference === 0 ? "Rekonsiliasi bank disimpan (cocok)." : "Rekonsiliasi bank disimpan."))
      .catch((err) => toast.error(err.message))
    setBusy(false)
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border p-4">
      <h2 className="font-semibold">Rekonsiliasi bank {month}</h2>
      <div className="flex flex-wrap items-end gap-4">
        <Field className="w-56">
          <FieldLabel htmlFor="statement">Saldo akhir rekening koran</FieldLabel>
          <NumberInput id="statement" value={statement} onChange={setStatement} />
        </Field>
        <div className="text-sm">
          <div className="text-muted-foreground">Saldo buku</div>
          <div className="font-medium tabular-nums">{formatNumber(closing)}</div>
        </div>
        <div className="text-sm">
          <div className="text-muted-foreground">Belum di rekening koran (masuk / keluar)</div>
          <div className="font-medium tabular-nums">
            {formatNumber(unclearedIn)} / {formatNumber(unclearedOut)}
          </div>
        </div>
        <div className="text-sm">
          <div className="text-muted-foreground">Selisih</div>
          <div className={`font-semibold tabular-nums ${difference ? "text-destructive" : difference === 0 ? "text-green-600" : ""}`}>
            {difference == null ? "—" : formatNumber(difference)}
          </div>
        </div>
        <Button className="ml-auto" onClick={save} disabled={busy || statement == null}>
          Simpan rekonsiliasi
        </Button>
      </div>
      {saved?.reconciled && <p className="text-sm text-green-600">Bulan ini sudah direkonsiliasi (selisih 0).</p>}
      <div className="flex flex-col gap-1 text-sm">
        <p className="text-muted-foreground">Centang baris yang sudah muncul di rekening koran:</p>
        {lines.map((l) => (
          <label key={l.key} className="flex items-center gap-2">
            <Checkbox checked={cleared.has(l.key)} onCheckedChange={(on) => toggle(l.key, on)} />
            <span className="w-24 tabular-nums">{formatDay(l.date)}</span>
            <span className="w-36 font-medium">{l.journal.number}</span>
            <span className="min-w-0 flex-1 truncate">{l.line.description || l.journal.description}</span>
            <span className="w-32 text-right tabular-nums">{l.line.debit ? `+${formatNumber(l.line.debit)}` : `−${formatNumber(l.line.credit)}`}</span>
          </label>
        ))}
        {!lines.length && <p className="text-muted-foreground">Tidak ada transaksi di bulan ini.</p>}
      </div>
    </section>
  )
}
