"use client"

import { useRef, useState } from "react"
import { DownloadIcon, UploadIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { downloadTemplate, sheetGrid, type TemplateSheet } from "@/lib/excel-template"
import { cn } from "@/lib/utils"

/**
 * Every Excel import shows this: a preview of the template (black header = mandatory,
 * yellow header = optional), then "Unduh template" and "Unggah file".
 */
export function ImportTemplate({
  sheets,
  fileName,
  onFile,
  disabled,
}: {
  sheets: TemplateSheet[]
  /** Download name, e.g. "template-pemasok.xlsx". */
  fileName: string
  onFile: (file: File | undefined) => void
  disabled?: boolean
}) {
  const input = useRef<HTMLInputElement>(null)
  const [chosen, setChosen] = useState("")

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <TemplatePreview sheets={sheets} />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" onClick={() => downloadTemplate(fileName, sheets).catch((err) => toast.error(err.message))}>
          <DownloadIcon />
          Unduh template
        </Button>
        <Button type="button" onClick={() => input.current?.click()} disabled={disabled}>
          <UploadIcon />
          Unggah file
        </Button>
        {chosen && <span className="truncate text-sm text-muted-foreground">{chosen}</span>}
        <input
          ref={input}
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            setChosen(file?.name ?? "")
            onFile(file)
            e.target.value = "" // so the same file can be chosen again
          }}
        />
      </div>
    </div>
  )
}

/** Looks like the Excel sheet: column letters, row numbers, coloured header, an example row and sheet tabs. */
export function TemplatePreview({ sheets }: { sheets: TemplateSheet[] }) {
  const [active, setActive] = useState(0)
  const sheet = sheets[Math.min(active, sheets.length - 1)]
  const grid = sheetGrid(sheet)
  const hasExample = sheet.columns.some((c) => c.example)
  const range = sheet.lastRow ? `baris ${sheet.headerRow + 1}–${sheet.lastRow}` : `baris ${sheet.headerRow + 1}`

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          Header di baris {sheet.headerRow}, data mulai {range}
          {sheet.optional && " · sheet ini opsional"}
        </span>
        <span className="flex items-center gap-3">
          <Legend className="bg-black text-white">Wajib</Legend>
          <Legend className="bg-yellow-300 text-black">Opsional</Legend>
        </span>
      </div>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-max border-collapse text-xs">
          <thead>
            <tr className="bg-muted text-muted-foreground">
              <th className="w-8 border-r border-b" />
              {grid.map(({ letter }) => (
                <th key={letter} className="border-r border-b px-2 py-0.5 font-normal last:border-r-0">
                  {letter}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sheet.headerRow > 1 && <GapRow label={sheet.headerRow > 2 ? `1–${sheet.headerRow - 1}` : "1"} span={grid.length} />}
            <tr>
              <RowNumber>{sheet.headerRow}</RowNumber>
              {grid.map(({ letter, column }) => (
                <td
                  key={letter}
                  className={cn(
                    "border-r border-b px-2 py-1 font-semibold whitespace-nowrap last:border-r-0",
                    column ? (column.required ? "bg-black text-white" : "bg-yellow-300 text-black") : "min-w-6"
                  )}
                >
                  {column?.header}
                </td>
              ))}
            </tr>
            {hasExample && (
              <tr className="text-muted-foreground italic">
                <RowNumber>{sheet.headerRow + 1}</RowNumber>
                {grid.map(({ letter, column }) => (
                  <td key={letter} className="border-r border-b px-2 py-1 whitespace-nowrap last:border-r-0">
                    {column?.example}
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {sheets.length > 1 && (
        <div className="flex flex-wrap gap-1">
          {sheets.map((s, i) => (
            <button
              key={s.name}
              type="button"
              onClick={() => setActive(i)}
              className={cn(
                "rounded-b-md border border-t-0 px-2.5 py-1 text-xs",
                i === active ? "bg-background font-semibold text-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Nama sheet harus <strong className="text-foreground">{sheet.name}</strong>.{" "}
        {hasExample && "Baris miring hanya contoh, tidak ada di template. "}
        {sheet.note}
      </p>
    </div>
  )
}

function Legend({ className, children }: { className: string; children: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={cn("inline-block size-3 rounded-sm border", className)} />
      {children}
    </span>
  )
}

function RowNumber({ children }: { children: React.ReactNode }) {
  return <td className="border-r border-b bg-muted px-1.5 text-center text-muted-foreground">{children}</td>
}

function GapRow({ label, span }: { label: string; span: number }) {
  return (
    <tr>
      <RowNumber>{label}</RowNumber>
      <td colSpan={span} className="border-b px-2 py-1 text-muted-foreground italic">
        dibiarkan kosong
      </td>
    </tr>
  )
}

/** Title + short description at the top of an import. */
export function ImportHeading({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex max-w-3xl flex-col gap-1">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground">{children}</p>
    </div>
  )
}
