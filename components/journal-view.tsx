"use client"

import { Undo2Icon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { SOURCE_LABELS, type Journal } from "@/lib/journal"
import { formatDay, formatNumber } from "@/lib/utils"

/**
 * A journal's lines with totals, and the button to cancel it when `onCancel` is given. Inside a Dialog by
 * default; `plain` for use on a page.
 */
export function JournalView({
  journal,
  label,
  busy,
  onCancel,
  plain,
}: {
  journal?: Journal
  label: (code: string) => string
  busy?: boolean
  onCancel?: (j: Journal) => void
  plain?: boolean
}) {
  if (!journal) return <p className="text-sm text-muted-foreground">Memuat jurnal…</p>
  const title = (
    <>
      Jurnal {journal.number}
      <Badge variant="brand">{SOURCE_LABELS[journal.source.kind]}</Badge>
    </>
  )
  const subtitle = `${formatDay(journal.date)} · ${journal.description}`
  return (
    <div className="flex min-w-0 flex-col gap-4">
      {plain ? (
        <div className="flex flex-col gap-1">
          <h2 className="flex flex-wrap items-center gap-2 font-medium">{title}</h2>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
      ) : (
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">{title}</DialogTitle>
          <DialogDescription>{subtitle}</DialogDescription>
        </DialogHeader>
      )}
      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Akun</TableHead>
              <TableHead>Keterangan</TableHead>
              <TableHead className="text-right">Debit</TableHead>
              <TableHead className="text-right">Kredit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {journal.lines.map((l, i) => (
              <TableRow key={i}>
                <TableCell className="whitespace-normal">{label(l.account)}</TableCell>
                <TableCell className="whitespace-normal text-muted-foreground">{l.description}</TableCell>
                <TableCell className="text-right tabular-nums">{l.debit ? formatNumber(l.debit) : ""}</TableCell>
                <TableCell className="text-right tabular-nums">{l.credit ? formatNumber(l.credit) : ""}</TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow className="bg-brand-soft/60 text-brand">
              <TableCell colSpan={2}>Total</TableCell>
              <TableCell className="text-right tabular-nums">{formatNumber(journal.total)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatNumber(journal.total)}</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>
      {onCancel && (
        <div className="flex justify-end">
          <Button variant="outline" onClick={() => onCancel(journal)} disabled={busy}>
            <Undo2Icon />
            Batalkan jurnal
          </Button>
        </div>
      )}
    </div>
  )
}
