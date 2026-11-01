import type { Account, AccountType, ReportLine } from "@/lib/collections"

export const ACCOUNT_TYPES: Record<AccountType, { label: string; balance: "debit" | "credit"; digit: string }> = {
  asset: { label: "Aset", balance: "debit", digit: "1" },
  liability: { label: "Liabilitas", balance: "credit", digit: "2" },
  equity: { label: "Ekuitas", balance: "credit", digit: "3" },
  revenue: { label: "Pendapatan", balance: "credit", digit: "4" },
  production: { label: "Biaya produksi", balance: "debit", digit: "5" },
  expense: { label: "Beban", balance: "debit", digit: "6" },
  otherIncome: { label: "Pendapatan lain", balance: "credit", digit: "7" },
  otherExpense: { label: "Beban lain", balance: "debit", digit: "8" },
}

/** Excel account groups (Grup akun) → account type. Keys are normalised with `groupKey`. */
export const EXCEL_GROUPS: Record<string, AccountType> = {
  "cash/bank": "asset",
  "account receivable": "asset",
  "other current asset": "asset",
  inventory: "asset",
  "fixed asset": "asset",
  "accumulated depreciation": "asset",
  "account payable": "liability",
  "other current liability": "liability",
  "long term liability": "liability",
  equity: "equity",
  revenue: "revenue",
  "cost of goods sold": "production",
  expense: "expense",
  "other income": "otherIncome",
  "other expense": "otherExpense",
}

/** Case-insensitive, extra spaces ignored: " Cash / Bank " → "cash/bank". */
export const groupKey = (text: string) => text.toLowerCase().replace(/\s*\/\s*/g, "/").replace(/\s+/g, " ").trim()

export const isAccountNumber = (code: string) => /^\d{6}$/.test(code)

/** Type from the first digit of the account number (1 = asset … 8 = other expense). */
export const guessType = (number: string) =>
  (Object.entries(ACCOUNT_TYPES).find(([, t]) => t.digit === number[0])?.[0] as AccountType | undefined) ?? null

/** NR.. = balance sheet (Neraca), LR.. = profit & loss (Laba Rugi). */
export const statementOf = (lineCode: string) =>
  lineCode.startsWith("NR") ? "Neraca" : lineCode.startsWith("LR") ? "Laba rugi" : "—"

export const prefixesOf = (line: ReportLine) =>
  line.prefixes.split(/[\s,]+/).filter(Boolean)

/** The active report line whose account-number prefix matches the longest, e.g. 61 beats 6. */
export function guessReportLine(number: string, lines: ReportLine[]) {
  let best: { code: string; length: number } | null = null
  for (const line of lines) {
    if (!line.active) continue
    for (const p of prefixesOf(line)) {
      if (number.startsWith(p) && p.length > (best?.length ?? 0)) best = { code: line.code, length: p.length }
    }
  }
  return best?.code ?? ""
}

/**
 * Fields an imported account still lacks, guessed from its number (`given` = what the sheet
 * already has, so no guess is needed). Guesses set `needsReview` so the page lists them;
 * saving the account in the form clears it.
 */
export function guessMissing(number: string, current: Account | undefined, lines: ReportLine[], given: { type?: AccountType; reportLine?: string } = {}) {
  const guess: Partial<Account> = {}
  const notes: string[] = []
  if (!given.type && !current?.type) {
    const type = guessType(number)
    if (type) {
      Object.assign(guess, { type, normalBalance: ACCOUNT_TYPES[type].balance })
      notes.push(`tipe ditebak: ${ACCOUNT_TYPES[type].label}`)
    }
  }
  if (!given.reportLine && !current?.reportLine) {
    const line = guessReportLine(number, lines)
    if (line) {
      guess.reportLine = line
      notes.push(`baris laporan ditebak dari nomor: ${line}`)
    } else notes.push("belum ada baris laporan")
  }
  if (notes.length) guess.needsReview = true
  return { guess, note: notes.join("; ") }
}
