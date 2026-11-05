import { Fragment } from "react"
import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import type { StatementSection } from "@/lib/statements"
import { cn, formatNumber } from "@/lib/utils"

type Summary = { label: string; values: number[] }

/**
 * Neraca / Laba rugi: sections of report lines with their accounts (each links to Buku besar), a total per
 * section, and summary rows (`after[sectionKey]`, e.g. Laba kotor) printed after a section.
 */
export function StatementTable({
  sections,
  periods,
  after = {},
  footer = [],
  label,
}: {
  sections: StatementSection[]
  periods: string[]
  after?: Record<string, Summary[]>
  footer?: Summary[]
  label: (code: string) => string
}) {
  const money = (n: number) => (n < 0 ? `(${formatNumber(-n)})` : formatNumber(n))
  const summary = (s: Summary, strong = false) => (
    <tr key={s.label} className={cn("border-b", strong ? "bg-brand-soft/60 font-semibold text-brand" : "bg-muted/40 font-medium")}>
      <td className="px-3 py-2">{s.label}</td>
      {s.values.map((v, i) => (
        <td key={i} className="px-3 py-2 text-right tabular-nums">
          {money(v)}
        </td>
      ))}
    </tr>
  )
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="px-3 py-2 font-medium">Keterangan</th>
            {periods.map((p) => (
              <th key={p} className="px-3 py-2 text-right font-medium whitespace-nowrap">
                {p}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sections.map((s) => (
            <Fragment key={s.key}>
              <tr className="border-b">
                <td colSpan={periods.length + 1} className="px-3 pt-4 pb-1 text-xs font-semibold tracking-wide text-brand uppercase">
                  {s.label}
                </td>
              </tr>
              {s.rows.map((r) => (
                <tr key={r.key} className="border-b align-top">
                  <td className="px-3 py-1.5 pl-6">
                    <div className="flex flex-wrap items-center gap-2">
                      {r.line && <span className="text-xs text-muted-foreground tabular-nums">{r.line}</span>}
                      {r.computed ? <span className="italic">{r.label}</span> : r.label}
                      {r.missing && <Badge variant="warning">Tanpa baris laporan</Badge>}
                    </div>
                    {r.line && r.accounts.length > 0 && (
                      <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                        {r.accounts.map((a) => (
                          <Link key={a} href={`/ledger?account=${a}`} className="hover:underline">
                            {label(a)}
                          </Link>
                        ))}
                      </div>
                    )}
                    {r.missing && (
                      <Link href={`/ledger?account=${r.accounts[0]}`} className="text-xs text-muted-foreground hover:underline">
                        Buku besar
                      </Link>
                    )}
                  </td>
                  {r.values.map((v, i) => (
                    <td key={i} className="px-3 py-1.5 text-right tabular-nums">
                      {money(v)}
                    </td>
                  ))}
                </tr>
              ))}
              {summary({ label: `Total ${s.label.toLowerCase()}`, values: s.totals })}
              {(after[s.key] ?? []).map((x) => summary(x, true))}
            </Fragment>
          ))}
          {footer.map((x) => summary(x, true))}
        </tbody>
      </table>
    </div>
  )
}
