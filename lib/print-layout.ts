import writeExcelFile, { type Feature } from "write-excel-file/browser"

/**
 * The Excel export of a printed document, as a grid of cells. Built in lib/documents.ts from the same
 * content as the print page (components/delivery-sheet.tsx, components/invoice-sheet.tsx).
 */
export type PrintCell = {
  value?: string | number | null
  /** Columns this cell covers (default 1). */
  span?: number
  bold?: boolean
  /** Font size in points (default: the layout's `fontSize`). */
  size?: number
  align?: "left" | "center" | "right"
  /** Thin border on every side, or a thicker line under the cell. */
  border?: "box" | "under"
  /** Number shown as a percentage (0,0087 → 0,87%). */
  percent?: boolean
  wrap?: boolean
  /** Font family, e.g. a Chinese font for Chinese text. */
  font?: string
}

/** Cells left to right (a spanning cell takes the place of the cells it covers); `height` in points. */
export type PrintRow = { cells: PrintCell[]; height?: number }

export type PrintLayout = {
  /** Sheet name, e.g. "SJ". */
  sheet: string
  orientation: "portrait" | "landscape"
  /** Column widths in characters (Excel); the printed page uses the same proportions. */
  columns: number[]
  fontSize: number
  rows: PrintRow[]
  /** Printing in Excel: fit to 1 page wide, or the whole sheet on 1 page. */
  fit: "width" | "page"
}

/** Row with `cells` padded by an empty cell up to `width` columns. */
export function row(width: number, cells: PrintCell[], height?: number): PrintRow {
  const used = cells.reduce((s, c) => s + (c.span ?? 1), 0)
  return { cells: used < width ? [...cells, { span: width - used }] : cells, height }
}

/** Empty row (spacing). */
export const gap = (width: number, height?: number) => row(width, [], height)

/** Joins two layouts' rows side by side (left block, a spacer column, right block). */
export function sideBySide(left: PrintRow[], leftWidth: number, right: PrintRow[], rightWidth: number): PrintRow[] {
  return Array.from({ length: Math.max(left.length, right.length) }, (_, i) => ({
    cells: [...(left[i]?.cells ?? [{ span: leftWidth }]), {}, ...(right[i]?.cells ?? [{ span: rightWidth }])],
    height: Math.max(left[i]?.height ?? 0, right[i]?.height ?? 0) || undefined,
  }))
}

const THIN = { borderStyle: "thin", borderColor: "#000000" } as const

/** Column index (0-based) → Excel letters: 0 → A, 26 → AA. */
const columnName = (i: number): string => (i >= 26 ? columnName(Math.floor(i / 26) - 1) : "") + String.fromCharCode(65 + (i % 26))

/**
 * write-excel-file has no print settings beyond orientation, so this adds them to the generated XML:
 * A4, fit to 1 page wide (or 1 page), 12 mm margins and a print area of the whole layout.
 */
function printSetup(layout: PrintLayout): Feature<File | Blob | ArrayBuffer> {
  const margin = 0.47 // inches ≈ 12 mm
  const xmlText = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  const area = `'${layout.sheet.replace(/'/g, "''")}'!$A$1:$${columnName(layout.columns.length - 1)}$${layout.rows.length}`
  return {
    files: {
      transform: {
        "xl/worksheets/sheet{id}.xml": {
          transform: (xml: string) =>
            xml
              .replace(/<pageMargins[^>]*\/>|<pageSetup[^>]*\/>/g, "")
              .replace(/(<worksheet[^>]*>)/, '$1<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>')
              .replace(
                /(<drawing[^>]*\/>)?<\/worksheet>$/,
                `<pageMargins left="${margin}" right="${margin}" top="${margin}" bottom="${margin}" header="0" footer="0"/>` +
                  `<pageSetup paperSize="9" orientation="${layout.orientation}" fitToWidth="1" fitToHeight="${layout.fit === "page" ? 1 : 0}"/>$1</worksheet>`
              ),
        },
        "xl/workbook.xml": {
          transform: (xml: string) => {
            const name = `<definedName name="_xlnm.Print_Area" localSheetId="0">${xmlText(area)}</definedName>`
            if (xml.includes("<definedNames/>")) return xml.replace("<definedNames/>", `<definedNames>${name}</definedNames>`)
            if (xml.includes("<definedNames>")) return xml.replace("<definedNames>", `<definedNames>${name}`)
            return xml.replace("</sheets>", `</sheets><definedNames>${name}</definedNames>`)
          },
        },
      },
    },
  }
}

/** Downloads the layout as an .xlsx with the same merged cells, borders, fonts and column widths. */
export async function downloadLayout(fileName: string, layout: PrintLayout) {
  const data = layout.rows.map((r) =>
    r.cells.flatMap((c, i) => {
      const value = c.value ?? null
      const cell = {
        value: value === "" || value == null ? undefined : value,
        columnSpan: c.span && c.span > 1 ? c.span : undefined,
        fontWeight: c.bold ? ("bold" as const) : undefined,
        fontSize: c.size,
        fontFamily: c.font,
        align: c.align,
        alignVertical: "center" as const,
        wrap: c.wrap,
        height: i === 0 ? r.height : undefined,
        format: typeof value === "number" ? (c.percent ? "0.00%" : Number.isInteger(value) ? "#,##0" : "#,##0.0##") : undefined,
        ...(c.border === "box" ? THIN : c.border === "under" ? { bottomBorderStyle: "medium" as const, bottomBorderColor: "#000000" } : {}),
      }
      return [cell, ...Array.from({ length: (c.span ?? 1) - 1 }, () => null)]
    })
  )
  await writeExcelFile(data, {
    sheet: layout.sheet,
    columns: layout.columns.map((width) => ({ width })),
    orientation: layout.orientation === "landscape" ? "landscape" : undefined,
    showGridLines: false,
  }, { fontSize: layout.fontSize, features: [printSetup(layout)] }).toFile(fileName)
}
