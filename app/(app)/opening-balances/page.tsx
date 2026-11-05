"use client"

import { useState } from "react"
import { toast } from "sonner"

import { useAuth } from "@/components/auth-provider"
import { NumberInput } from "@/components/number-input"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useCollection } from "@/hooks/use-collection"
import { useLedger } from "@/hooks/use-ledger"
import type { Account } from "@/lib/accounts"
import { round2 } from "@/lib/bank-book"
import { valueMovements } from "@/lib/costing"
import { INVENTORY_ITEMS, INVENTORY_MOVEMENTS, type InventoryItem, type InventoryMovement } from "@/lib/inventory"
import { OPENING_ID, OPENING_TEST_ID, saveOpening, type Journal } from "@/lib/journal"
import { isPnl } from "@/lib/ledger"
import { cn, formatDay, formatNumber, today } from "@/lib/utils"

export default function OpeningBalancesPage() {
  const ledger = useLedger()
  const { role } = useAuth()
  // A Developer can keep a separate test Saldo awal (removed by Data uji), so testing never overwrites the real one.
  const [test, setTest] = useState(false)
  if (ledger.loading) return <p className="text-sm text-muted-foreground">Memuat…</p>
  if (ledger.error) return <p className="text-sm text-destructive">{ledger.error.message}</p>
  const id = test ? OPENING_TEST_ID : OPENING_ID
  const opening = ledger.journals.find((j) => j.id === id)
  return (
    <div className="flex flex-col gap-4">
      {role === "developer" && (
        <Field orientation="horizontal" className="w-fit rounded-xl border p-3">
          <Checkbox id="test" checked={test} onCheckedChange={setTest} />
          <FieldLabel htmlFor="test" className="font-normal">
            <strong>Saldo awal uji</strong>: disimpan terpisah dari saldo awal asli dan ikut terhapus di Admin → Data uji.
          </FieldLabel>
        </Field>
      )}
      {/* Remounts when the mode or the saved journal changes, so the form starts from it. */}
      <OpeningForm key={`${id}-${opening ? `${opening.date}-${opening.total}` : "new"}`} test={test} opening={opening} accounts={ledger.accounts} journals={ledger.journals} />
    </div>
  )
}

type Amounts = Record<string, { debit: number | null; credit: number | null }>

/** Balances of the balance-sheet accounts on the opening date; saved as the one Saldo awal journal. */
function OpeningForm({ test, opening, accounts, journals }: { test: boolean; opening?: Journal; accounts: Account[]; journals: Journal[] }) {
  const items = useCollection<InventoryItem>(INVENTORY_ITEMS)
  const movements = useCollection<InventoryMovement>(INVENTORY_MOVEMENTS)
  const [date, setDate] = useState(() => opening?.date ?? `${today().slice(0, 8)}01`)
  const [search, setSearch] = useState("")
  const [amounts, setAmounts] = useState<Amounts>(() =>
    Object.fromEntries((opening?.lines ?? []).map((l) => [l.account, { debit: l.debit || null, credit: l.credit || null }]))
  )
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const set = (code: string, patch: Partial<Amounts[string]>) => setAmounts((a) => ({ ...a, [code]: { ...(a[code] ?? { debit: null, credit: null }), ...patch } }))
  const debit = round2(Object.values(amounts).reduce((s, a) => s + (a.debit ?? 0), 0))
  const credit = round2(Object.values(amounts).reduce((s, a) => s + (a.credit ?? 0), 0))
  const diff = round2(debit - credit)
  const q = search.trim().toLowerCase()
  const shown = accounts.filter(
    (a) => (a.active || amounts[a.code]) && (!isPnl(a) || amounts[a.code]) && (!q || [a.code, a.nameId, a.group].some((v) => v?.toLowerCase().includes(q)))
  )
  const groups = [...new Set(shown.map((a) => a.group || "Tanpa grup"))]
  const earlier = journals.filter((j) => j.id !== OPENING_ID && j.id !== OPENING_TEST_ID && j.date < date).length

  // Stock value per inventory account at the end of the opening date, to compare with what is typed.
  const valued = valueMovements(movements.data)
  const stockValue = new Map<string, number>()
  for (const i of items.data) {
    const last = (valued.get(i.id) ?? []).filter((m) => m.date <= date).at(-1)
    if (i.account && last) stockValue.set(i.account, round2((stockValue.get(i.account) ?? 0) + last.valueAfter))
  }

  async function save() {
    setError(null)
    setBusy(true)
    try {
      const n = await saveOpening(
        date,
        Object.entries(amounts).map(([account, a]) => ({ account, description: "Saldo awal", debit: a.debit, credit: a.credit })),
        test
      )
      toast.success(`Saldo awal${test ? " uji" : ""} per ${formatDay(date)} disimpan (${n} akun).`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
    setBusy(false)
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-3xl text-sm text-muted-foreground">
        Saldo setiap akun neraca pada tanggal mulai pembukuan (mis. neraca per 31 Oktober). Disimpan sebagai satu jurnal &quot;Saldo awal&quot;; menyimpan
        lagi menggantikannya. Akun persediaan harus sama dengan nilai stok awal bahan bakunya.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <Field className="w-48">
          <FieldLabel htmlFor="date">Tanggal saldo awal</FieldLabel>
          <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>
        <Input className="w-full sm:w-72" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari akun…" aria-label="Cari akun" />
        {opening && <Badge variant={test ? "warning" : "success"}>{test ? "Saldo awal uji" : "Tersimpan"} per {formatDay(opening.date)}</Badge>}
      </div>
      {earlier > 0 && (
        <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">
          Ada {earlier} jurnal bertanggal sebelum {formatDay(date)}. Saldo awal sebaiknya tanggal paling awal.
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="px-3 py-2 font-medium">Akun</th>
              <th className="w-44 px-3 py-2 font-medium">Debit</th>
              <th className="w-44 px-3 py-2 font-medium">Kredit</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => [
              <tr key={`g-${g}`} className="bg-muted/50">
                <td colSpan={3} className="px-3 py-1.5 font-medium">
                  {g}
                </td>
              </tr>,
              ...shown
                .filter((a) => (a.group || "Tanpa grup") === g)
                .map((a) => {
                  const stock = a.link === "inventory" ? (stockValue.get(a.code) ?? 0) : null
                  const typed = round2((amounts[a.code]?.debit ?? 0) - (amounts[a.code]?.credit ?? 0))
                  return (
                    <tr key={a.code} className="border-b last:border-0">
                      <td className="px-3 py-1.5">
                        <div>
                          <span className="font-medium tabular-nums">{a.code}</span> {a.nameId}
                        </div>
                        {stock !== null && (
                          <div className={cn("text-xs", stock === typed ? "text-muted-foreground" : "text-warning")}>
                            Nilai stok bahan baku per tanggal ini: {formatNumber(stock)}
                            {stock !== typed && " (belum sama)"}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-1.5">
                        <NumberInput value={amounts[a.code]?.debit ?? null} onChange={(debit) => set(a.code, { debit })} placeholder="0" aria-label={`Debit ${a.code}`} />
                      </td>
                      <td className="px-3 py-1.5">
                        <NumberInput value={amounts[a.code]?.credit ?? null} onChange={(credit) => set(a.code, { credit })} placeholder="0" aria-label={`Kredit ${a.code}`} />
                      </td>
                    </tr>
                  )
                }),
            ])}
          </tbody>
          <tfoot>
            <tr className="bg-brand-soft/60 font-medium text-brand">
              <td className="px-3 py-2">Total {diff ? <span className="text-destructive">· selisih {formatNumber(diff)}</span> : "· seimbang"}</td>
              <td className="px-3 py-2 tabular-nums">{formatNumber(debit)}</td>
              <td className="px-3 py-2 tabular-nums">{formatNumber(credit)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {error && <FieldError>{error}</FieldError>}
      <Button className="w-fit" onClick={save} disabled={busy || !!diff || !debit || !date}>
        {busy ? "Menyimpan…" : `${opening ? "Simpan ulang" : "Simpan"} saldo awal${test ? " uji" : ""}`}
      </Button>
    </div>
  )
}
