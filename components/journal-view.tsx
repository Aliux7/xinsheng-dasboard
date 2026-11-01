"use client"

import Link from "next/link"
import { Undo2Icon } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { BANKS, JOURNAL_SOURCES, type Account, type Journal } from "@/lib/collections"
import { reverseJournal } from "@/lib/journal"
import { formatDay, formatNumber, today } from "@/lib/utils"

const money = (n: number) => (n ? formatNumber(n) : "")

/** Where an entry's source document lives. */
const DOCUMENT_PAGES: Record<NonNullable<Journal["document"]>["type"], string> = {
  purchaseInvoice: "/purchase-invoices",
  importPurchase: "/import-purchases",
  supplierPayment: "/supplier-payments",
  salesInvoice: "/sales-invoices",
  customerReceipt: "/customer-receipts",
  fgProduction: "/finished-goods",
  inventoryPosting: "/inventory-value",
}

/** Bank entries are made (and opened) on the Buku bank page; manual and General Ledger ones here. */
const editableHere = (j: Journal) => j.source === "manual" || j.source === "gl"

/** One journal entry: header, lines with account names, totals, and its action. */
export function JournalView({ journal: j, accounts }: { journal: Journal; accounts: Account[] }) {
  const name = (code: string) => accounts.find((a) => a.code === code)?.nameId ?? ""
  const bank = BANKS.find((b) => b.id === j.source)

  async function reverse() {
    const date = prompt(`Tanggal jurnal balik untuk ${j.number} (YYYY-MM-DD):`, today())
    if (!date) return
    await reverseJournal(j, date)
      .then((reversal) => toast.success(`${j.number} dibalik dengan ${reversal.number}.`))
      .catch((err) => toast.error(err.message))
  }

  return (
    <div className="rounded-xl border">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b bg-muted/40 px-3 py-2 text-sm">
        <span className="font-semibold">{j.number || "—"}</span>
        <span className="text-muted-foreground">{formatDay(j.date)}</span>
        <Badge variant="outline">{JOURNAL_SOURCES[j.source]}</Badge>
        {!j.balanced && <Badge variant="destructive">Tidak seimbang</Badge>}
        {j.reverses && <Badge variant="secondary">Jurnal balik</Badge>}
        {j.reversedBy && <Badge variant="secondary">Sudah dibalik</Badge>}
        <span className="min-w-0 flex-1 truncate">
          {j.counterparty && <span className="font-medium">{j.counterparty} · </span>}
          {j.description}
        </span>
        {j.document ? (
          <Button size="sm" variant="ghost" render={<Link href={DOCUMENT_PAGES[j.document.type]} />} nativeButton={false}>
            Buka {j.document.number}
          </Button>
        ) : bank ? (
          <Button size="sm" variant="ghost" render={<Link href={`/bank?bank=${bank.id}`} />} nativeButton={false}>
            Buka di Buku bank
          </Button>
        ) : editableHere(j) && !j.reversedBy && !j.reverses ? (
          <Button size="sm" variant="ghost" onClick={reverse}>
            <Undo2Icon />
            Buat jurnal balik
          </Button>
        ) : null}
      </div>
      <table className="w-full text-sm">
        <tbody>
          {j.lines.map((l, i) => (
            <tr key={i} className="border-b last:border-0">
              <td className="w-24 px-3 py-1.5 font-medium tabular-nums">{l.account}</td>
              <td className="px-3 py-1.5">
                <div>{name(l.account)}</div>
                <div className="text-xs text-muted-foreground">
                  {[l.description, l.descriptionZh, l.currency && l.currency !== "IDR" && `${l.currency} ${formatNumber(l.amount)} × ${formatNumber(l.rate)}`, l.note]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </td>
              <td className="w-36 px-3 py-1.5 text-right tabular-nums">{money(l.debit)}</td>
              <td className="w-36 px-3 py-1.5 text-right tabular-nums">{money(l.credit)}</td>
            </tr>
          ))}
          <tr className="font-medium">
            <td className="px-3 py-1.5" colSpan={2}>
              Total
            </td>
            <td className="px-3 py-1.5 text-right tabular-nums">{formatNumber(j.totalDebit)}</td>
            <td className="px-3 py-1.5 text-right tabular-nums">{formatNumber(j.totalCredit)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

/** Opens one entry in a dialog (from the ledger, bank book…). */
export function JournalDialog({ journal, accounts, onClose }: { journal: Journal | null; accounts: Account[]; onClose: () => void }) {
  return (
    <Dialog open={journal !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{journal?.number}</DialogTitle>
        </DialogHeader>
        {journal && <JournalView journal={journal} accounts={accounts} />}
      </DialogContent>
    </Dialog>
  )
}
