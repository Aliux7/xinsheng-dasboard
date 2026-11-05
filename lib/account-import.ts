import readXlsxFile from "read-excel-file/browser"
import writeXlsxFile from "write-excel-file/browser"

import { ACCOUNTS, ACCOUNT_TYPES, guessType, type Account, type AccountType, type NormalBalance } from "@/lib/accounts"
import { transaction } from "@/lib/db"

/**
 * Daftar akun import from the client's COA workbook: no header row, column A the 6-digit number,
 * B the English name, C the Indonesian name. A row without a number is a group heading (B English,
 * C Indonesian) for the accounts below it. Type and normal balance come from the first digit; report
 * lines are not in the file and stay empty.
 */

type Cell = string | number | boolean | Date | null

export type CoaSheet = { name: string; cells: Cell[][] }

/** Columns A–C of the client's COA sheet, with example rows for the preview and the template. */
export const COA_COLUMNS = [
  { col: "A", label: "Nomor akun (6 digit)", required: true },
  { col: "B", label: "Nama Inggris", required: true },
  { col: "C", label: "Nama Indonesia", required: false },
] as const

export const COA_EXAMPLE: Cell[][] = [
  [null, "Cash & Bank", "Kas & Bank"],
  [101001, "Cash - IDR", "Kas IDR"],
  [101201, "Bank BCA 1 PT", "Bank BCA 1 PT"],
  [null, "Account Receivable", "Piutang Usaha"],
  [103101, "Account Receivable IDR", "Piutang Usaha IDR"],
]

export type CoaRow = {
  /** Excel row number. */
  row: number
  code: string
  nameEn: string
  nameId: string
  group: string
  accountGroup: string
  type: AccountType | null
  normalBalance: NormalBalance | null
  /** new = not in Daftar akun yet; update = names or group differ; same = nothing to change. */
  status: "new" | "update" | "same"
  /** Fields that differ from the saved account (status update). */
  changes: string[]
  error?: string
  warnings: string[]
}

export type ParsedCoa = { rows: CoaRow[]; skipped: { row: number; reason: string }[] }

const text = (c: Cell | undefined) => (c == null ? "" : String(c).replace(/\s+/g, " ").trim())

export async function readCoa(file: File): Promise<CoaSheet[]> {
  return (await readXlsxFile(file)).map((s) => ({ name: s.sheet, cells: s.data as Cell[][] }))
}

/** Number of rows with a 6-digit account number in column A. */
export const countAccounts = (sheet: CoaSheet) => sheet.cells.filter((r) => /^\d{6}$/.test(text(r[0]))).length

/** The sheet's accounts, each under the last group heading above it, compared with the saved ones. */
export function buildCoa(cells: Cell[][], existing: Account[]): ParsedCoa {
  const saved = new Map(existing.map((a) => [a.code, a]))
  const seen = new Map<string, number>()
  const rows: CoaRow[] = []
  const skipped: ParsedCoa["skipped"] = []
  let groupId = ""
  let accountGroup = ""

  cells.forEach((r, i) => {
    const row = i + 1
    const [a, b, c] = [text(r[0]), text(r[1]), text(r[2])]
    if (!a && !b && !c) return
    if (!a) {
      groupId = c
      accountGroup = b || c
      return
    }
    if (!/^\d{6}$/.test(a)) return skipped.push({ row, reason: `"${a}" bukan nomor akun 6 digit` })

    const warnings: string[] = []
    let error: string | undefined
    if (!b && !c) error = "Nama kosong"
    if (!accountGroup) warnings.push("Tidak ada judul grup di atasnya")
    if (seen.has(a)) error = `Nomor ${a} sudah ada di baris ${seen.get(a)}`
    else seen.set(a, row)

    const old = saved.get(a)
    const guessed = guessType(a)
    // A saved account keeps its type; the guess only fills one that is missing.
    const type = old?.type ?? guessed
    if (!type) warnings.push(`Tipe tidak bisa ditebak dari digit ${a[0]}, isi manual nanti`)

    // Without an Indonesian name or group heading the saved one stays; a new account takes the English one.
    if (!c && b && !old?.nameId) warnings.push("Nama Indonesia kosong, memakai nama Inggris")
    const next = { nameEn: b || c, nameId: c || old?.nameId || b, group: groupId || old?.group || accountGroup, accountGroup }
    const labels = { nameEn: "nama Inggris", nameId: "nama Indonesia", group: "grup", accountGroup: "grup Excel" } as const
    const changes: string[] = old ? (Object.keys(next) as (keyof typeof next)[]).filter((k) => (old[k] ?? "") !== next[k]).map((k) => labels[k]) : []
    if (old && !old.type && type) changes.push("tipe")

    rows.push({
      row,
      code: a,
      ...next,
      type,
      normalBalance: old?.normalBalance ?? (type ? ACCOUNT_TYPES[type].balance : null),
      status: !old ? "new" : changes.length ? "update" : "same",
      changes,
      error,
      warnings,
    })
  })
  return { rows, skipped }
}

/**
 * Saves the rows: new accounts in full (no report line, active); existing ones only get their names,
 * group and a missing type, so report lines, Chinese names and active stay as they are.
 */
export function saveCoa(rows: CoaRow[]) {
  return transaction(async (w) => {
    for (const r of rows) {
      const names = { nameEn: r.nameEn, nameId: r.nameId, group: r.group, accountGroup: r.accountGroup }
      const old = await w.get<Account>(ACCOUNTS, r.code)
      if (!old) {
        await w.set(ACCOUNTS, r.code, {
          code: r.code,
          ...names,
          nameZh: "",
          type: r.type,
          normalBalance: r.normalBalance,
          reportLine: "",
          needsReview: !r.type,
          active: true,
        })
      } else {
        await w.update(ACCOUNTS, r.code, { ...names, ...(!old.type && r.type && { type: r.type, normalBalance: r.normalBalance }) })
      }
    }
    return rows.length
  })
}

/** An empty-ish COA sheet in the client's layout (no header row), with the example rows. */
export async function downloadCoaTemplate() {
  await writeXlsxFile(
    COA_EXAMPLE.map((r) => r.map((value, i) => (value == null ? null : { value, fontWeight: r[0] == null && i > 0 ? ("bold" as const) : undefined }))),
    { sheet: "COA", columns: [{ width: 12 }, { width: 45 }, { width: 45 }] }
  ).toFile("template-daftar-akun.xlsx")
}
