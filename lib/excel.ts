import { readSheet } from "read-excel-file/browser"

/** Reads rows `fromRow`..`toRow` (1-based, inclusive) of one sheet as trimmed text cells. */
export async function readRows(file: File, sheet: string, fromRow: number, toRow = Infinity) {
  let rows
  try {
    rows = await readSheet(file, sheet)
  } catch (err) {
    throw new Error(`Tidak dapat membaca sheet "${sheet}": ${err instanceof Error ? err.message : err}`)
  }
  return rows
    .slice(fromRow - 1, toRow)
    .map((row) => row.map((cell) => (cell == null ? "" : String(cell).trim())))
}
