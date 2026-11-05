"use client"

import { Suspense, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { BookCheckIcon, ChevronRightIcon, EyeIcon, PackageIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { DataTable, type Column } from "@/components/data-table"
import { JournalView } from "@/components/journal-view"
import { MonthPicker } from "@/components/month-picker"
import { SimpleSelect } from "@/components/simple-select"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { NumberInput } from "@/components/number-input"
import { useCollection } from "@/hooks/use-collection"
import { DIRECTION_LABEL, LINKS, stockDirection, stockText, type StockLine } from "@/lib/account-links"
import { ACCOUNTS, type Account } from "@/lib/accounts"
import { BANKS, BANK_TRANSACTIONS, bankLabel, sortBook, type Bank, type BankTransaction } from "@/lib/bank-book"
import { updateRecord } from "@/lib/db"
import { INVENTORY_ITEMS, type InventoryItem } from "@/lib/inventory"
import { JOURNALS, cancelJournal, journalVouchers, setContra, setRowStock, voucherProblem, vouchersOf, type Journal, type LinkOf, type Voucher } from "@/lib/journal"
import { cn, formatDay, formatNumber, today } from "@/lib/utils"

/** Writes per transaction (each document + its log entry); Firestore allows 500. */
const MAX_WRITES = 450

const STATUS = [
  { value: "todo", label: "Belum dijurnal" },
  { value: "done", label: "Sudah dijurnal" },
]

type Row = BankTransaction & { voucher: Voucher; first: boolean }

export default function BankJournalPage() {
  // ?bank= needs a Suspense boundary with cacheComponents.
  return (
    <Suspense>
      <BankJournal />
    </Suspense>
  )
}

function BankJournal() {
  const router = useRouter()
  const banks = useCollection<Bank>(BANKS, { orderBy: "name" })
  const accounts = useCollection<Account>(ACCOUNTS, { orderBy: "code" })
  const active = banks.data.filter((b) => b.active)
  const bankId = useSearchParams().get("bank") ?? active[0]?.id ?? ""
  const bank = banks.data.find((b) => b.id === bankId)
  const rows = useCollection<BankTransaction>(BANK_TRANSACTIONS, { where: [["bank", "==", bankId]], skip: !bankId })
  const journals = useCollection<Journal>(JOURNALS, { where: [["source.bank", "==", bankId]], skip: !bankId })
  const [month, setMonth] = useState(() => today().slice(0, 7))
  const [status, setStatus] = useState("todo")
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [bulk, setBulk] = useState("")
  const [busy, setBusy] = useState(false)
  const [viewing, setViewing] = useState<string | null>(null)
  const [stocking, setStocking] = useState<BankTransaction | null>(null)
  const items = useCollection<InventoryItem>(INVENTORY_ITEMS, { orderBy: "name" })
  const itemById = new Map(items.data.map((i) => [i.id, i]))

  const bankAccount = bank?.accountCode
  const accountName = new Map(accounts.data.map((a) => [a.code, a.nameId]))
  const accountLink = new Map(accounts.data.map((a) => [a.code, a.link]))
  const linkOf: LinkOf = (code) => accountLink.get(code)
  const label = (code: string) => `${code} · ${accountName.get(code) ?? "?"}`
  // Any active account except this bank's own.
  const contraOptions = accounts.data.filter((a) => a.active && a.code !== bankAccount).map((a) => ({ value: a.code, label: label(a.code) }))
  const bankOptions = accounts.data.filter((a) => a.active && a.type === "asset").map((a) => ({ value: a.code, label: label(a.code) }))
  const anyJournaled = rows.data.some((r) => r.journal)

  const vouchers = vouchersOf(sortBook(rows.data).filter((r) => !month || r.date.startsWith(month)))
  const done = (v: Voucher) => v.rows.every((r) => r.journal)
  const shownVouchers = vouchers.filter((v) => (status === "done" ? done(v) : !done(v)))
  const shown: Row[] = shownVouchers.flatMap((v) => v.rows.map((r, i) => ({ ...r, voucher: v, first: i === 0 })))
  const ready = shownVouchers.filter((v) => !voucherProblem(v, bankAccount, linkOf))
  const todoCount = vouchers.filter((v) => !done(v)).length
  const openingRows = rows.data.filter((r) => r.opening).length

  async function run<T>(action: () => Promise<T>, done: (result: T) => string) {
    setBusy(true)
    try {
      toast.success(done(await action()))
      return true
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
      return false
    } finally {
      setBusy(false)
    }
  }

  const linkAccount = (code: string) => bank && run(() => updateRecord(BANKS, bank.id, { accountCode: code }), () => `${bank.name} dihubungkan ke akun ${label(code)}.`)

  async function applyBulk() {
    const ids = [...picked]
    // Each row is a write plus a log entry.
    const ok = await run(async () => {
      for (let i = 0; i < ids.length; i += MAX_WRITES / 2) await setContra(ids.slice(i, i + MAX_WRITES / 2), bulk)
    }, () => `Akun lawan ${label(bulk)} diisi ke ${ids.length} baris.`)
    if (ok) setPicked(new Set())
  }

  async function journalAll() {
    const batches: { number: string; rowIds: string[] }[][] = [[]]
    let writes = 0
    for (const v of ready) {
      const cost = (v.rows.length + 1) * 2
      if (writes + cost > MAX_WRITES && batches.at(-1)!.length) {
        batches.push([])
        writes = 0
      }
      batches.at(-1)!.push({ number: v.number, rowIds: v.rows.map((r) => r.id) })
      writes += cost
    }
    let saved = 0
    await run(async () => {
      for (const b of batches) saved += await journalVouchers(bankId, b)
    }, () => `${saved} voucher dijurnal.`)
  }

  const toggle = (ids: string[], on: boolean) =>
    setPicked((p) => {
      const next = new Set(p)
      for (const id of ids) {
        if (on) next.add(id)
        else next.delete(id)
      }
      return next
    })
  const todoIds = shown.filter((r) => !r.journal).map((r) => r.id)

  const columns: Column<Row>[] = [
    ...(status === "todo"
      ? [
          {
            header: "",
            cell: (r: Row) => <Checkbox checked={picked.has(r.id)} onCheckedChange={(on) => toggle([r.id], on)} aria-label={`Pilih ${r.number}`} />,
          },
        ]
      : []),
    { header: "Tanggal", cell: (r) => formatDay(r.date) },
    {
      header: "Keterangan",
      cell: (r) => (
        <span className="whitespace-normal">
          {r.name && <span className="font-medium">{r.name} · </span>}
          {r.description}
          {r.descriptionZh && <span className="text-muted-foreground"> {r.descriptionZh}</span>}
        </span>
      ),
    },
    { header: "Masuk (Rp)", cell: (r) => (r.amount > 0 ? formatNumber(r.amount) : ""), className: "text-right tabular-nums text-success" },
    { header: "Keluar (Rp)", cell: (r) => (r.amount < 0 ? formatNumber(-r.amount) : ""), className: "text-right tabular-nums" },
    {
      header: "Akun lawan",
      cell: (r) =>
        r.journal ? (
          <div className="whitespace-normal">
            <div>{r.contra ? label(r.contra) : "—"}</div>
            {!!r.stock?.length && (
              <div className="text-xs text-muted-foreground">
                {DIRECTION_LABEL[stockDirection(r.amount)]}: {stockText(r.stock, itemById)}
              </div>
            )}
          </div>
        ) : (
          <div className="flex w-72 flex-col gap-1">
            <SimpleSelect
              id={`contra-${r.id}`}
              value={r.contra ?? ""}
              onChange={(code) => run(() => setContra([r.id], code), () => `Akun lawan ${r.number}: ${code ? label(code) : "dikosongkan"}.`)}
              options={contraOptions}
              placeholder="Pilih akun lawan"
              disabled={busy}
            />
            {r.contra && linkOf(r.contra) === "inventory" && (
              // A real button: not filled = dashed amber call to action; filled = summary with "Ubah".
              <button
                type="button"
                onClick={() => setStocking(r)}
                disabled={busy}
                className={cn(
                  "flex w-full cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs shadow-xs transition-colors outline-none",
                  "focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
                  r.stock?.length
                    ? "border-brand/30 bg-background text-foreground hover:border-brand hover:bg-brand-soft/50"
                    : "border-dashed border-warning bg-warning-soft text-warning hover:bg-warning/15 active:bg-warning/25"
                )}
              >
                {r.stock?.length ? <PackageIcon className="size-4 shrink-0 text-brand" /> : <PlusIcon className="size-4 shrink-0" />}
                <span className="min-w-0 flex-1">
                  {r.stock?.length ? (
                    <>
                      <span className="font-medium text-brand">{DIRECTION_LABEL[stockDirection(r.amount)]}:</span> {stockText(r.stock, itemById)}
                    </>
                  ) : (
                    <>
                      <span className="font-semibold">Isi bahan baku</span> · {DIRECTION_LABEL[stockDirection(r.amount)].toLowerCase()}
                    </>
                  )}
                </span>
                {r.stock?.length ? (
                  <span className="flex shrink-0 items-center gap-1 font-medium text-brand">
                    <PencilIcon className="size-3.5" />
                    Ubah
                  </span>
                ) : (
                  <ChevronRightIcon className="size-4 shrink-0" />
                )}
              </button>
            )}
          </div>
        ),
    },
    {
      header: "Status",
      cell: (r) => {
        if (!r.first) return null
        if (r.journal)
          return (
            <Button size="sm" variant="ghost" onClick={() => setViewing(r.journal!)}>
              <EyeIcon />
              Lihat jurnal
            </Button>
          )
        const problem = voucherProblem(r.voucher, bankAccount, linkOf)
        return problem ? <span className="text-xs whitespace-normal text-warning">{problem}</span> : <Badge variant="success">Siap</Badge>
      },
      className: "max-w-48",
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-full sm:w-64">
          <SimpleSelect
            id="bank"
            value={bankId}
            onChange={(b) => router.replace(`/bank-journal?bank=${b}`)}
            placeholder={banks.loading ? "Memuat…" : "Belum ada rekening"}
            options={banks.data.filter((b) => b.active || b.id === bankId).map((b) => ({ value: b.id, label: bankLabel(b) }))}
          />
        </div>
        <MonthPicker month={month} onChange={setMonth} />
        <div className="w-full sm:w-44">
          <SimpleSelect id="status" value={status} onChange={(s) => (setStatus(s), setPicked(new Set()))} options={STATUS} />
        </div>
        {bank && (
          <Field className="w-full sm:ml-auto sm:w-72">
            <FieldLabel htmlFor="bankAccount">Akun bank ini</FieldLabel>
            <SimpleSelect
              id="bankAccount"
              value={bankAccount ?? ""}
              onChange={linkAccount}
              options={bankOptions}
              placeholder="Pilih akun (mis. 101201)"
              disabled={busy || anyJournaled}
              required
            />
          </Field>
        )}
      </div>

      {bank && !bankAccount && (
        <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">
          Pilih dulu akun Daftar akun untuk rekening {bank.name} (kolom &quot;Akun bank ini&quot;). Akun ini menjadi sisi bank di setiap jurnal.
        </p>
      )}
      {anyJournaled && <p className="text-xs text-muted-foreground">Akun bank terkunci karena sudah ada baris yang dijurnal.</p>}

      {status === "todo" && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border p-3">
          <Field orientation="horizontal" className="w-auto">
            <Checkbox
              id="all"
              checked={todoIds.length > 0 && todoIds.every((id) => picked.has(id))}
              onCheckedChange={(on) => toggle(todoIds, on)}
              disabled={!todoIds.length}
            />
            <FieldLabel htmlFor="all">Pilih semua ({todoIds.length})</FieldLabel>
          </Field>
          <Button size="sm" variant="outline" onClick={() => setPicked(new Set(shown.filter((r) => !r.journal && !r.contra).map((r) => r.id)))} disabled={!todoIds.length}>
            Pilih yang belum ada akun lawan
          </Button>
          <div className="w-full sm:w-72">
            <SimpleSelect id="bulk" value={bulk} onChange={setBulk} options={contraOptions} placeholder="Akun lawan untuk baris terpilih" />
          </div>
          <Button size="sm" onClick={applyBulk} disabled={busy || !bulk || !picked.size}>
            Isi ke {picked.size} baris
          </Button>
          <Button className="sm:ml-auto" onClick={journalAll} disabled={busy || !ready.length}>
            <BookCheckIcon />
            Jurnalkan {ready.length} voucher siap
          </Button>
        </div>
      )}

      <DataTable
        columns={columns}
        data={shown}
        loading={rows.loading || accounts.loading}
        error={rows.error ?? accounts.error}
        empty={!bankId ? "Pilih rekening bank." : status === "todo" ? "Semua voucher bulan ini sudah dijurnal." : "Belum ada voucher yang dijurnal bulan ini."}
        groupBy={(r) => r.number}
        rowClassName={(r) => (picked.has(r.id) ? "bg-brand-soft/40" : undefined)}
      />
      <p className="text-xs text-muted-foreground">
        {todoCount} voucher bulan ini belum dijurnal. Satu nomor bukti (BBM/BBK) = satu jurnal: bank di satu sisi, akun lawan tiap baris di sisi lain.
        {openingRows > 0 && " Baris saldo awal tidak dijurnal di sini; saldo awal diatur terpisah nanti."}
      </p>

      <Dialog open={!!stocking} onOpenChange={(o) => !o && setStocking(null)}>
        <DialogContent className="sm:max-w-2xl">
          {stocking && (
            <StockLines
              row={stocking}
              account={label(stocking.contra!)}
              items={items.data.filter((i) => i.active || stocking.stock?.some((l) => l.item === i.id))}
              onDone={() => setStocking(null)}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="sm:max-w-3xl">
          {viewing && (
            <JournalView
              journal={journals.data.find((j) => j.id === viewing)}
              label={label}
              busy={busy}
              onCancel={async (j) => {
                const stock = j.links?.some((l) => l.link === "inventory") ? " Stok bahan bakunya juga dibalik." : ""
                if (!confirm(`Batalkan jurnal ${j.number}? Baris buku banknya kembali menjadi belum dijurnal (akun lawan tetap tersimpan).${stock}`)) return
                if (await run(() => cancelJournal(j.id), (n) => `Jurnal ${n} dibatalkan.`)) setViewing(null)
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

type Line = { item: string; qty: number | null; value: number | null }

/** Items and quantities of a row whose contra account is linked to inventory (`lib/account-links.ts`). */
function StockLines({ row, account, items, onDone }: { row: BankTransaction; account: string; items: InventoryItem[]; onDone: () => void }) {
  const amount = Math.abs(row.amount)
  const [lines, setLines] = useState<Line[]>(() => (row.stock?.length ? row.stock : [{ item: "", qty: null, value: amount }]))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const dir = stockDirection(row.amount)
  const byId = new Map(items.map((i) => [i.id, i]))
  const set = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)))
  const options = items.map((i) => ({ value: i.id, label: `${i.code ? `${i.code} · ` : ""}${i.name} (stok ${formatNumber(i.stock)} ${i.unit})` }))
  const short = dir === "out" ? lines.filter((l) => l.item && (l.qty ?? 0) > (byId.get(l.item)?.stock ?? 0)) : []
  const rest = Math.round((amount - lines.reduce((s, l) => s + (l.value ?? 0), 0)) * 100) / 100

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const n = await setRowStock(row.id, lines.filter((l) => l.item && l.qty).map((l) => ({ item: l.item, qty: l.qty!, value: l.value ?? 0 }) satisfies StockLine))
      toast.success(`${n} bahan baku disimpan untuk ${row.number}.`)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
    setBusy(false)
  }

  return (
    <form onSubmit={submit} className="flex min-w-0 flex-col gap-4">
      <DialogHeader>
        <DialogTitle>
          Bahan baku untuk {row.number} · {DIRECTION_LABEL[dir]}
        </DialogTitle>
        <DialogDescription>
          {row.description} · {formatNumber(Math.abs(row.amount))} · akun lawan {account}. {LINKS.inventory.rules[1]} Stok berubah saat voucher dijurnal.
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-2">
        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2 rounded-lg border p-2 sm:grid-cols-[1fr_7rem_9rem_auto] sm:border-0 sm:p-0">
            <div className="col-span-3 sm:col-span-1">
              <SimpleSelect id={`item-${i}`} value={l.item} onChange={(item) => set(i, { item })} options={options} placeholder="Pilih bahan baku" required />
            </div>
            <NumberInput value={l.qty} onChange={(qty) => set(i, { qty })} placeholder={byId.get(l.item)?.unit ?? "Jumlah"} aria-label="Jumlah" required />
            <NumberInput value={l.value} onChange={(value) => set(i, { value })} placeholder="Nilai (Rp)" aria-label="Nilai (Rp)" required />
            <Button type="button" size="icon-sm" variant="ghost" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} disabled={lines.length === 1} aria-label="Hapus baris">
              <Trash2Icon />
            </Button>
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" size="sm" variant="outline" className="w-fit" onClick={() => setLines((ls) => [...ls, { item: "", qty: null, value: rest > 0 ? rest : null }])}>
            <PlusIcon />
            Tambah bahan baku
          </Button>
          <span className={cn("text-sm", rest ? "text-warning" : "text-muted-foreground")}>
            Nilai baris {formatNumber(amount)} · {rest ? `sisa belum dibagi ${formatNumber(rest)}` : "sudah terbagi semua"}
          </span>
        </div>
      </div>
      {short.length > 0 && (
        <p className="text-sm text-warning">Stok sekarang belum cukup untuk: {short.map((l) => byId.get(l.item)?.name).join(", ")}. Jurnal akan ditolak bila saat itu stok masih kurang.</p>
      )}
      {error && <FieldError>{error}</FieldError>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Batal
        </Button>
        <Button type="submit" disabled={busy || rest !== 0}>
          {busy ? "Menyimpan…" : "Simpan bahan baku"}
        </Button>
      </DialogFooter>
    </form>
  )
}
