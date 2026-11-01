"use client"

import { useState } from "react"
import Link from "next/link"
import { FileDownIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { Account } from "@/lib/collections"
import { downloadExcel } from "@/lib/export"
import { cn, formatNumber } from "@/lib/utils"

export type StatementRow = {
  kind: "header" | "line" | "total" | "grand"
  label: string
  values: number[]
  /** Accounts behind a line, for drill-down. */
  accounts?: string[]
  /** Highlight (e.g. a difference that should be 0). */
  warn?: boolean
}

type Props = {
  rows: StatementRow[]
  columns: string[]
  accounts: Account[]
  /** Per-account value for the drill-down column (last column). */
  accountValue: (code: string) => number
  fileName: string
  sheet: string
  loading?: boolean
}

/** Financial statement grid: sections, lines (click → accounts → ledger), totals; hides zero lines by default. */
export function StatementTable({ rows, columns, accounts, accountValue, fileName, sheet, loading }: Props) {
  const [showZero, setShowZero] = useState(false)
  const [open, setOpen] = useState<StatementRow | null>(null)
  const shown = rows.filter((r) => showZero || r.kind !== "line" || r.values.some((v) => v))
  const name = (code: string) => accounts.find((a) => a.code === code)?.nameId ?? ""

  return (
    <>
      <div className="flex items-center gap-4">
        <Field orientation="horizontal" className="w-auto">
          <Switch id="showZero" checked={showZero} onCheckedChange={setShowZero} />
          <FieldLabel htmlFor="showZero">Tampilkan baris nol</FieldLabel>
        </Field>
        <Button
          variant="outline"
          className="ml-auto"
          disabled={loading}
          onClick={() => downloadExcel(fileName, sheet, ["", ...columns], shown.map((r) => [r.label, ...r.values]), [36, ...columns.map(() => 15)])}
        >
          <FileDownIcon />
          Ekspor Excel
        </Button>
      </div>
      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="sticky left-0 bg-background" />
              {columns.map((c) => (
                <TableHead key={c} className="text-right">
                  {c}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((r, i) => (
              <TableRow
                key={i}
                className={cn(
                  r.kind === "header" && "bg-muted/40 font-semibold hover:bg-muted/40",
                  r.kind === "total" && "font-medium",
                  r.kind === "grand" && "bg-muted/60 font-semibold",
                  r.warn && "text-destructive"
                )}
              >
                <TableCell className={cn("sticky left-0 bg-background", r.kind === "line" && "pl-6")}>
                  {r.kind === "line" && r.accounts?.length ? (
                    <button type="button" className="underline-offset-4 hover:underline" onClick={() => setOpen(r)}>
                      {r.label}
                    </button>
                  ) : (
                    r.label
                  )}
                </TableCell>
                {columns.map((_, c) => (
                  <TableCell key={c} className="text-right tabular-nums">
                    {r.kind === "header" ? "" : r.values[c] ? formatNumber(r.values[c]) : "—"}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Dialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{open?.label}</DialogTitle>
          </DialogHeader>
          <ul className="flex flex-col gap-1 text-sm">
            {open?.accounts?.map((code) => (
              <li key={code} className="flex justify-between gap-4">
                <Link href={`/ledger?account=${code}`} className="underline-offset-4 hover:underline">
                  {code} {name(code)}
                </Link>
                <span className="tabular-nums">{formatNumber(accountValue(code))}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">Angka per akun: kolom terakhir ({columns.at(-1)}). Klik akun untuk membuka buku besar.</p>
        </DialogContent>
      </Dialog>
    </>
  )
}
