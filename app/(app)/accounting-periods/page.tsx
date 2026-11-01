"use client"

import { useState } from "react"
import { CheckCircle2Icon, LockIcon, LockOpenIcon, XCircleIcon } from "lucide-react"
import { toast } from "sonner"

import { useCanCloseMonth, useIsAdmin } from "@/components/auth-provider"
import { DataTable, type Column } from "@/components/data-table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { useCollection } from "@/hooks/use-collection"
import { useToday } from "@/hooks/use-today"
import { ACCOUNTING_PERIODS, BANKS, BANK_RECS, JOURNALS, type AccountingPeriod, type BankRec, type Journal } from "@/lib/collections"
import { closeAccountingMonth, reopenAccountingMonth, round2 } from "@/lib/journal"
import { previousMonth } from "@/lib/report"
import { formatDate, monthRange } from "@/lib/utils"

type Row = { id: string; month: string; period?: AccountingPeriod }

export default function AccountingPeriodsPage() {
  const canClose = useCanCloseMonth()
  const isAdmin = useIsAdmin()
  const thisMonth = useToday()?.slice(0, 7)
  const periods = useCollection<AccountingPeriod>(ACCOUNTING_PERIODS)
  const first = useCollection<Journal>(JOURNALS, { orderBy: "date", limit: 1 }).data[0]?.date.slice(0, 7)
  const [checking, setChecking] = useState<string | null>(null)

  // Every month from the first entry (or this month) up to this month, newest first.
  const months: string[] = []
  if (thisMonth) for (let m = thisMonth; m >= (first ?? thisMonth); m = previousMonth(m)) months.push(m)
  const rows: Row[] = months.map((month) => ({ id: month, month, period: periods.data.find((p) => p.id === month) }))

  async function reopen(month: string) {
    const reason = prompt(`Alasan membuka kembali periode ${month}?`)?.trim()
    if (reason)
      await reopenAccountingMonth(month, reason)
        .then(() => toast.success(`Periode ${month} dibuka kembali.`))
        .catch((err) => toast.error(err.message))
  }

  const columns: Column<Row>[] = [
    { header: "Bulan", cell: (r) => <span className="font-medium">{r.month}</span> },
    {
      header: "Status",
      cell: (r) =>
        r.period?.status === "closed" ? (
          <Badge variant="secondary">
            <LockIcon /> Ditutup
          </Badge>
        ) : (
          <Badge variant="outline">Terbuka</Badge>
        ),
    },
    {
      header: "Ditutup oleh",
      cell: (r) => (r.period?.status === "closed" ? `${r.period.closedBy?.email} · ${formatDate(r.period.closedAt)}` : ""),
      className: "hidden md:table-cell",
    },
    {
      header: "Dibuka kembali",
      cell: (r) =>
        r.period?.reopenedBy ? (
          <span className="text-xs whitespace-normal">
            {r.period.reopenedBy.email} · {formatDate(r.period.reopenedAt)} — {r.period.reopenReason}
          </span>
        ) : (
          ""
        ),
      className: "hidden lg:table-cell",
    },
    {
      header: "",
      cell: (r) =>
        r.period?.status === "closed" ? (
          isAdmin && (
            <Button size="sm" variant="ghost" onClick={() => reopen(r.month)}>
              <LockOpenIcon />
              Buka kembali
            </Button>
          )
        ) : (
          canClose && (
            <Button size="sm" variant="ghost" onClick={() => setChecking(r.month)}>
              <LockIcon />
              Tutup periode
            </Button>
          )
        ),
    },
  ]

  return (
    <>
      <DataTable columns={columns} {...periods} data={rows} />
      <Dialog open={checking !== null} onOpenChange={(open) => !open && setChecking(null)}>
        <DialogContent>{checking && <Checklist month={checking} onDone={() => setChecking(null)} />}</DialogContent>
      </Dialog>
    </>
  )
}

/** Checks before closing; the month can only be closed when all pass. */
function Checklist({ month, onDone }: { month: string; onDone: () => void }) {
  const [start, end] = monthRange(month)
  const journals = useCollection<Journal>(JOURNALS, { where: [["date", ">=", start], ["date", "<", end]] })
  const recs = useCollection<BankRec>(BANK_RECS).data
  const [busy, setBusy] = useState(false)

  const debit = round2(journals.data.reduce((s, j) => s + j.totalDebit, 0))
  const credit = round2(journals.data.reduce((s, j) => s + j.totalCredit, 0))
  const unbalanced = journals.data.filter((j) => !j.balanced)
  const activeBanks = BANKS.filter((b) => journals.data.some((j) => j.accounts.includes(b.account)))
  const notReconciled = activeBanks.filter((b) => !recs.find((r) => r.id === `${b.id}-${month}`)?.reconciled)

  const checks = [
    { ok: debit === credit, label: "Neraca saldo seimbang", detail: debit === credit ? "" : `debit ${debit.toLocaleString("id-ID")} ≠ kredit ${credit.toLocaleString("id-ID")}` },
    { ok: !notReconciled.length, label: "Semua buku bank direkonsiliasi", detail: notReconciled.map((b) => b.name).join(", ") },
    { ok: !unbalanced.length, label: "Tidak ada jurnal tidak seimbang", detail: unbalanced.map((j) => j.number).join(", ") },
  ]
  const allOk = checks.every((c) => c.ok)

  async function close() {
    setBusy(true)
    try {
      await closeAccountingMonth(month)
      toast.success(`Periode ${month} ditutup.`)
      onDone()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Tutup periode {month}</DialogTitle>
      </DialogHeader>
      {journals.loading ? (
        <Skeleton className="my-6 h-24" />
      ) : (
        <ul className="my-6 flex flex-col gap-3 text-sm">
          {checks.map((c) => (
            <li key={c.label} className="flex items-start gap-2">
              {c.ok ? <CheckCircle2Icon className="size-5 shrink-0 text-green-600" /> : <XCircleIcon className="size-5 shrink-0 text-destructive" />}
              <div>
                <div className="font-medium">{c.label}</div>
                {c.detail && <div className="text-muted-foreground">{c.detail}</div>}
              </div>
            </li>
          ))}
          <li className="text-muted-foreground">
            Setelah ditutup, jurnal bertanggal {month} tidak bisa ditambah atau dibalik. Hanya Admin, Master atau Developer yang dapat membuka kembali.
          </li>
        </ul>
      )}
      <DialogFooter>
        <DialogClose render={<Button variant="outline" type="button" />}>Batal</DialogClose>
        <Button onClick={close} disabled={busy || journals.loading || !allOk}>
          <LockIcon />
          Tutup periode
        </Button>
      </DialogFooter>
    </>
  )
}
