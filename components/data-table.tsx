import type { ReactNode } from "react"

import type { CollectionState } from "@/hooks/use-collection"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

export type Column<T> = {
  header: string
  cell: (row: T) => ReactNode
  className?: string
}

/** Table for a `useCollection` result: spread the hook's return value into it. */
export function DataTable<T extends { id: string }>({
  columns,
  data,
  loading,
  error,
  empty = "Belum ada data.",
  groupBy,
  rowClassName,
}: Omit<CollectionState<T>, "data"> & {
  data: T[]
  columns: Column<T>[]
  empty?: string
  /** Shows rows under headings; a heading starts again whenever it changes from the row above. */
  groupBy?: (row: T) => string
  /** Extra classes per row, e.g. a warning colour. */
  rowClassName?: (row: T) => string | undefined
}) {
  const message = error ? error.message : loading ? null : !data.length ? empty : null

  return (
    <div className="rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((c) => (
              <TableHead key={c.header} className={c.className}>
                {c.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            Array.from({ length: 3 }, (_, i) => (
              <TableRow key={i}>
                <TableCell colSpan={columns.length}>
                  <Skeleton className="h-5 w-full" />
                </TableCell>
              </TableRow>
            ))
          ) : message ? (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="h-24 text-center text-muted-foreground"
              >
                {message}
              </TableCell>
            </TableRow>
          ) : (
            grouped(data, groupBy).flatMap(([heading, rows], i) => [
              heading !== null && (
                <TableRow key={`heading-${i}-${heading}`} className="bg-muted/50 hover:bg-muted/50">
                  <TableCell colSpan={columns.length} className="font-medium">
                    {heading || "Tanpa judul"}
                  </TableCell>
                </TableRow>
              ),
              ...rows.map((row) => (
                <TableRow key={row.id} className={cn("align-top", rowClassName?.(row))}>
                  {columns.map((c) => (
                    <TableCell key={c.header} className={c.className}>
                      {c.cell(row)}
                    </TableCell>
                  ))}
                </TableRow>
              )),
            ])
          )}
        </TableBody>
      </Table>
    </div>
  )
}

/** [heading, rows] per run of consecutive rows with the same heading; one null heading when not grouping. */
function grouped<T>(rows: T[], groupBy?: (row: T) => string): [string | null, T[]][] {
  if (!groupBy) return [[null, rows]]
  const groups: [string, T[]][] = []
  for (const row of rows) {
    const key = groupBy(row)
    const last = groups.at(-1)
    if (last?.[0] === key) last[1].push(row)
    else groups.push([key, [row]])
  }
  return groups
}
