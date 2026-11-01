import writeExcelFile from "write-excel-file/browser"

type Cell = string | number | null
export type ExportSheet = { name: string; header: string[]; rows: Cell[][]; widths?: number[] }

const toSheet = ({ name, header, rows, widths }: ExportSheet) => ({
  sheet: name,
  data: [header.map((value) => ({ value, fontWeight: "bold" as const })), ...rows],
  columns: widths?.map((width) => ({ width })),
})

/** Downloads one or more sheets as one .xlsx: each a bold header row, then its rows. Widths are in characters. */
export async function downloadSheets(fileName: string, sheets: ExportSheet[]) {
  await writeExcelFile(sheets.map(toSheet)).toFile(fileName)
}

/** Single-sheet shortcut. */
export function downloadExcel(fileName: string, sheet: string, header: string[], rows: Cell[][], widths?: number[]) {
  return downloadSheets(fileName, [{ name: sheet, header, rows, widths }])
}
