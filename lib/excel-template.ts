import writeExcelFile from "write-excel-file/browser"

/**
 * Excel import templates: which sheet, which header row and which columns an importer reads.
 * The same description drives the on-screen preview and the downloadable .xlsx, so the
 * template always matches what the import expects.
 */

export type TemplateColumn = {
  /** Column letter the importer reads, e.g. "B". */
  col: string
  header: string
  required?: boolean
  /** Shown in the preview only (never written to the file, so it can't be imported by mistake). */
  example?: string
}

export type TemplateSheet = {
  name: string
  /** 1-based row of the header; data starts on the next row. */
  headerRow: number
  /** Last row the importer reads, if limited. */
  lastRow?: number
  /** The import still works without this sheet. */
  optional?: boolean
  note?: string
  columns: TemplateColumn[]
}

export const MANDATORY_STYLE = {
  backgroundColor: "#000000",
  textColor: "#FFFFFF",
}
export const OPTIONAL_STYLE = {
  backgroundColor: "#FFFF00",
  textColor: "#000000",
}

/** "A" → 0, "AB" → 27 */
export const colIndex = (col: string) => [...col.toUpperCase()].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1

/** 0 → "A", 27 → "AB" */
export const colLetter = (index: number): string =>
  index < 26 ? String.fromCharCode(65 + index) : colLetter(Math.floor(index / 26) - 1) + String.fromCharCode(65 + (index % 26))

/** Columns A..last, with the template column at each position (or none for unused columns). */
export function sheetGrid(sheet: TemplateSheet) {
  const byIndex = new Map(sheet.columns.map((c) => [colIndex(c.col), c]))
  const last = Math.max(...byIndex.keys())
  return Array.from({ length: last + 1 }, (_, i) => ({
    letter: colLetter(i),
    column: byIndex.get(i),
  }))
}

/** Writes the header rows only: black/white = mandatory, yellow/black = optional; data rows stay empty. */
export async function downloadTemplate(fileName: string, sheets: TemplateSheet[]) {
  await writeExcelFile(
    sheets.map((sheet) => {
      const grid = sheetGrid(sheet)
      const header = grid.map(({ column }) =>
        column
          ? {
              value: column.header,
              fontWeight: "bold" as const,
              ...(column.required ? MANDATORY_STYLE : OPTIONAL_STYLE),
            }
          : null
      )
      return {
        sheet: sheet.name,
        data: [...Array.from({ length: sheet.headerRow - 1 }, () => [null]), header],
        columns: grid.map(({ column }) => ({
          width: column ? Math.max(12, column.header.length + 4) : 4,
        })),
      }
    })
  ).toFile(fileName)
}
