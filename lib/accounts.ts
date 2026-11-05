import { LINKS } from "@/lib/account-links"
import { addRecord, updateRecord } from "@/lib/db"

/**
 * Chart of accounts (Daftar akun): `accounts/{6-digit number}`. The number never changes; accounts are
 * deactivated, never deleted. Same shape as the accounts saved by the earlier version.
 */
export const ACCOUNTS = "accounts"

export type AccountType = "asset" | "liability" | "equity" | "revenue" | "production" | "expense" | "otherIncome" | "otherExpense"
export type NormalBalance = "debit" | "credit"
/** Data an account can be connected to; what each does is in `lib/account-links.ts`. */
export type AccountLink = "inventory"

export type Account = {
  id: string
  /** 6-digit account number, also the document id. */
  code: string
  nameId: string
  nameEn: string
  nameZh: string
  /** Group heading, e.g. Kas & Bank. */
  group: string
  /** Original group from Excel, e.g. Cash/Bank, Fixed Asset. */
  accountGroup?: string
  type: AccountType | null
  normalBalance: NormalBalance | null
  /** Report line code, e.g. NR01 (Neraca) or LR12 (Laba rugi). */
  reportLine: string
  /** Connected data (rules in `lib/account-links.ts`); null / missing = not connected. */
  link?: AccountLink | null
  /** Set by the earlier import when it guessed type or report line; cleared on save. */
  needsReview?: boolean
  active: boolean
}

/** Type → label, normal balance and the first digit of its account numbers. */
export const ACCOUNT_TYPES: Record<AccountType, { label: string; balance: NormalBalance; digit: string }> = {
  asset: { label: "Aset", balance: "debit", digit: "1" },
  liability: { label: "Liabilitas", balance: "credit", digit: "2" },
  equity: { label: "Ekuitas", balance: "credit", digit: "3" },
  revenue: { label: "Pendapatan", balance: "credit", digit: "4" },
  production: { label: "Biaya produksi", balance: "debit", digit: "5" },
  expense: { label: "Beban", balance: "debit", digit: "6" },
  otherIncome: { label: "Pendapatan lain", balance: "credit", digit: "7" },
  otherExpense: { label: "Beban lain", balance: "debit", digit: "8" },
}

export const isAccountNumber = (code: string) => /^\d{6}$/.test(code)

/** Type from the first digit of the account number (1 = asset … 8 = other expense). */
export const guessType = (number: string) =>
  (Object.entries(ACCOUNT_TYPES).find(([, t]) => t.digit === number[0])?.[0] as AccountType | undefined) ?? null

export type AccountInput = Omit<Account, "id" | "needsReview" | "link"> & { link: AccountLink | null }

/** Adds an account (number unique) or saves an existing one; saving clears the import's "Periksa". */
export function saveAccount(input: AccountInput, isNew: boolean) {
  if (!isAccountNumber(input.code)) throw new Error("Nomor akun harus tepat 6 digit.")
  if (input.link && !(input.type && LINKS[input.link].types.includes(input.type)))
    throw new Error(`${LINKS[input.link].label} hanya untuk akun bertipe ${LINKS[input.link].types.map((t) => ACCOUNT_TYPES[t].label).join(" / ")}.`)
  const data = { ...input, reportLine: input.reportLine.trim().toUpperCase(), needsReview: false }
  return isNew ? addRecord(ACCOUNTS, data, input.code) : updateRecord(ACCOUNTS, input.code, data)
}
