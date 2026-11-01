"use client"

import { useState } from "react"
import { toast } from "sonner"
import { PlusIcon, Trash2Icon } from "lucide-react"

import { AccountSelect } from "@/components/account-select"
import { FilterSelect } from "@/components/filter-select"
import { JournalView } from "@/components/journal-view"
import { MonthPicker, useMonth } from "@/components/month-picker"
import { NumberInput } from "@/components/number-input"
import { SimpleSelect } from "@/components/simple-select"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { useCollection } from "@/hooks/use-collection"
import { ACCOUNTS, JOURNALS, JOURNAL_SOURCES, type Account, type Journal, type JournalLine, type JournalSource } from "@/lib/collections"
import { emptyLine, entryError, round2, saveJournal, totalsOf } from "@/lib/journal"
import { formatNumber, today } from "@/lib/utils"

/** Sources entered on this page; bank, purchase and sales entries come from their own pages. */
const MANUAL_SOURCES: JournalSource[] = ["manual", "gl"]
const CURRENCIES = ["IDR", "USD", "CNY", "SGD"]

export default function JournalPage() {
  const accounts = useCollection<Account>(ACCOUNTS).data
  const { month, setMonth, where, skip } = useMonth()
  const journals = useCollection<Journal>(JOURNALS, { where, skip })
  const [source, setSource] = useState("")
  const [account, setAccount] = useState("")
  const [creating, setCreating] = useState(false)

  const shown = journals.data
    .filter((j) => (!source || j.source === source) && (!account || j.accounts.includes(account)))
    .sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number, undefined, { numeric: true }))

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <MonthPicker month={month} setMonth={setMonth} />
        <FilterSelect
          id="filter-source"
          value={source}
          onChange={setSource}
          rows={Object.entries(JOURNAL_SOURCES).map(([code, name]) => ({ code, name }))}
          allLabel="Semua sumber"
        />
        <div className="w-full sm:w-72">
          <AccountSelect value={account} onChange={setAccount} accounts={accounts} placeholder="Semua akun" />
        </div>
        <Button className="ml-auto" onClick={() => setCreating(true)}>
          <PlusIcon />
          Jurnal baru
        </Button>
      </div>
      {journals.loading ? (
        <Skeleton className="h-32 w-full" />
      ) : journals.error ? (
        <p className="text-sm text-destructive">{journals.error.message}</p>
      ) : shown.length ? (
        <div className="flex flex-col gap-3">
          {shown.map((j) => (
            <JournalView key={j.id} journal={j} accounts={accounts} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Belum ada jurnal di bulan ini.</p>
      )}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="sm:max-w-5xl">{creating && <JournalForm accounts={accounts} onDone={() => setCreating(false)} />}</DialogContent>
      </Dialog>
    </>
  )
}

function JournalForm({ accounts, onDone }: { accounts: Account[]; onDone: () => void }) {
  const [date, setDate] = useState(today)
  const [source, setSource] = useState<JournalSource>("manual")
  const [counterparty, setCounterparty] = useState("")
  const [description, setDescription] = useState("")
  const [lines, setLines] = useState<JournalLine[]>([emptyLine(), emptyLine()])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const update = (i: number, patch: Partial<JournalLine>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)))
  const { debit, credit, difference } = totalsOf(lines)
  const problem = entryError(lines)

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (problem) return setError(problem)
    setSaving(true)
    try {
      const saved = await saveJournal({ date, source, counterparty: counterparty.trim(), description: description.trim(), lines })
      toast.success(`Jurnal ${saved.number} disimpan.`)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit}>
      <DialogHeader>
        <DialogTitle>Jurnal baru</DialogTitle>
      </DialogHeader>
      <FieldGroup className="my-6">
        <div className="grid gap-4 sm:grid-cols-4">
          <Field>
            <FieldLabel htmlFor="date">Tanggal</FieldLabel>
            <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </Field>
          <Field>
            <FieldLabel htmlFor="source">Sumber</FieldLabel>
            <SimpleSelect
              id="source"
              value={source}
              onChange={(v) => setSource(v as JournalSource)}
              options={MANUAL_SOURCES.map((s) => ({ value: s, label: JOURNAL_SOURCES[s] }))}
              required
            />
          </Field>
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="counterparty">Pihak terkait</FieldLabel>
            <Input id="counterparty" value={counterparty} onChange={(e) => setCounterparty(e.target.value)} />
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="description">Keterangan</FieldLabel>
          <Input id="description" value={description} onChange={(e) => setDescription(e.target.value)} required />
        </Field>

        <div className="flex flex-col gap-3">
          {lines.map((line, i) => (
            <LineEditor
              key={i}
              index={i}
              line={line}
              accounts={accounts}
              onChange={(patch) => update(i, patch)}
              onRemove={lines.length > 2 ? () => setLines((ls) => ls.filter((_, j) => j !== i)) : undefined}
            />
          ))}
          <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => setLines((ls) => [...ls, emptyLine()])}>
            <PlusIcon />
            Tambah baris
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-4 rounded-lg bg-muted/50 p-3 text-sm">
          <div>
            <div className="text-muted-foreground">Total debit</div>
            <div className="font-semibold tabular-nums">{formatNumber(debit)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Total kredit</div>
            <div className="font-semibold tabular-nums">{formatNumber(credit)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Selisih</div>
            <div className={`font-semibold tabular-nums ${difference ? "text-destructive" : "text-green-600"}`}>{formatNumber(difference)}</div>
          </div>
        </div>
        {error && <FieldError>{error}</FieldError>}
      </FieldGroup>
      <DialogFooter>
        <DialogClose render={<Button variant="outline" type="button" />}>Batal</DialogClose>
        <Button type="submit" disabled={saving || !!problem}>
          {saving ? "Menyimpan…" : "Simpan"}
        </Button>
      </DialogFooter>
    </form>
  )
}

function LineEditor({
  index,
  line,
  accounts,
  onChange,
  onRemove,
}: {
  index: number
  line: JournalLine
  accounts: Account[]
  onChange: (patch: Partial<JournalLine>) => void
  onRemove?: () => void
}) {
  const foreign = line.currency !== "IDR"
  const side = line.credit && !line.debit ? "credit" : "debit"
  // Foreign lines: Rupiah = original amount × rate, on the chosen side.
  const setForeign = (patch: { amount?: number | null; rate?: number | null; side?: "debit" | "credit" }) => {
    const amount = patch.amount !== undefined ? patch.amount : line.amount
    const rate = patch.rate !== undefined ? patch.rate : line.rate
    const rupiah = amount && rate ? round2(amount * rate) : 0
    const s = patch.side ?? side
    onChange({ amount, rate, debit: s === "debit" ? rupiah : 0, credit: s === "credit" ? rupiah : 0 })
  }

  return (
    <div className="grid gap-2 rounded-lg border p-3 sm:grid-cols-12">
      <div className="sm:col-span-4">
        <AccountSelect id={`account-${index}`} value={line.account} onChange={(account) => onChange({ account })} accounts={accounts} required />
      </div>
      <Input className="sm:col-span-3" placeholder="Keterangan baris" value={line.description} onChange={(e) => onChange({ description: e.target.value })} />
      <Input className="sm:col-span-2" placeholder="说明 (opsional)" lang="zh" value={line.descriptionZh} onChange={(e) => onChange({ descriptionZh: e.target.value })} />
      <div className="sm:col-span-2">
        <SimpleSelect
          id={`currency-${index}`}
          value={line.currency}
          onChange={(currency) => onChange({ currency, amount: null, rate: null, debit: 0, credit: 0 })}
          options={CURRENCIES.map((c) => ({ value: c, label: c }))}
        />
      </div>
      <div className="flex justify-end sm:col-span-1">
        {onRemove && (
          <Button type="button" size="icon-sm" variant="ghost" onClick={onRemove} aria-label="Hapus baris" title="Hapus baris">
            <Trash2Icon />
          </Button>
        )}
      </div>
      {foreign ? (
        <>
          <NumberInput className="sm:col-span-2" placeholder={`Jumlah ${line.currency}`} value={line.amount} onChange={(amount) => setForeign({ amount })} />
          <NumberInput className="sm:col-span-2" placeholder="Kurs" value={line.rate} onChange={(rate) => setForeign({ rate })} />
          <div className="sm:col-span-2">
            <SimpleSelect
              id={`side-${index}`}
              value={side}
              onChange={(s) => setForeign({ side: s as "debit" | "credit" })}
              options={[
                { value: "debit", label: "Debit" },
                { value: "credit", label: "Kredit" },
              ]}
            />
          </div>
          <div className="flex items-center text-sm tabular-nums sm:col-span-2">Rp {formatNumber(line.debit || line.credit)}</div>
        </>
      ) : (
        <>
          <NumberInput className="sm:col-span-3" placeholder="Debit (Rp)" value={line.debit || null} onChange={(v) => onChange({ debit: v ?? 0, credit: v ? 0 : line.credit })} />
          <NumberInput className="sm:col-span-3" placeholder="Kredit (Rp)" value={line.credit || null} onChange={(v) => onChange({ credit: v ?? 0, debit: v ? 0 : line.debit })} />
        </>
      )}
      <Input className={foreign ? "sm:col-span-4" : "sm:col-span-6"} placeholder="Catatan" value={line.note} onChange={(e) => onChange({ note: e.target.value })} />
    </div>
  )
}
