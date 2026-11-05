import type { AccountLink, AccountType } from "@/lib/accounts"
import type { BankTransaction } from "@/lib/bank-book"
import type { Writer } from "@/lib/db"
import { INVENTORY_ITEMS, move, type InventoryItem } from "@/lib/inventory"
import { formatNumber } from "@/lib/utils"

/**
 * Account links: the one place that says what happens when an account is connected to other data.
 * An account in Daftar akun may have `link` = one of LINKS. Each link says
 *  - which account types may use it,
 *  - what a bank row needs before it can be journaled with that account as its contra (`problem`),
 *  - what journaling does to the linked data (`apply`) and what cancelling the journal does (`undo`),
 *    both inside the journal's transaction, so the journal and the linked data never disagree.
 * Adding a link = a new entry here, its row data on BankTransaction, and its input in Jurnal buku bank.
 */

/** One item line of a bank row whose contra is an inventory account; `value` = its share of the row's rupiah. */
export type StockLine = { item: string; qty: number; value: number }

/**
 * Debit on the account (money out of the bank: bought) = stock in; credit (money in: sold or refunded) =
 * stock out.
 */
export const stockDirection = (amount: number): "in" | "out" => (amount < 0 ? "in" : "out")
export const DIRECTION_LABEL = { in: "Stok masuk", out: "Stok keluar" } as const

type JournalRef = { id: string; number: string }

type LinkRule = {
  label: string
  /** Account types that may have this link. */
  types: AccountType[]
  /** What it does, shown in Daftar akun when choosing the link. */
  rules: string[]
  problem: (row: BankTransaction) => string | null
  apply: (w: Writer, row: BankTransaction, journal: JournalRef) => Promise<void>
  undo: (w: Writer, row: BankTransaction, journal: JournalRef) => Promise<void>
}

export const LINKS: Record<AccountLink, LinkRule> = {
  inventory: {
    label: "Inventory (stok bahan baku)",
    types: ["asset"],
    rules: [
      "Saat menjurnal baris buku bank dengan akun ini sebagai akun lawan, wajib memilih bahan baku dan jumlahnya (boleh lebih dari satu bahan baku).",
      "Uang keluar dari bank (akun ini di debit, mis. beli bahan) = stok masuk. Uang masuk ke bank (akun ini di kredit, mis. jual atau retur) = stok keluar.",
      "Nilai rupiah baris dibagi ke bahan bakunya (satu bahan baku = seluruh nilai); itu menjadi nilai persediaannya.",
      "Stok berubah saat voucher dijurnal, dengan tanggal baris buku bank dan nomor bukti sebagai keterangan; tercatat di Riwayat stok.",
      "Batalkan jurnal = stoknya dibalik (pergerakan kebalikan). Ditolak bila stok sudah tidak cukup untuk dibalik.",
    ],
    problem: (row) => {
      const lines = (row.stock ?? []).filter((l) => l.qty > 0)
      if (!lines.length) return "Bahan baku belum diisi"
      const sum = Math.round(lines.reduce((s, l) => s + (l.value ?? 0), 0) * 100) / 100
      return sum === Math.abs(row.amount) ? null : "Nilai bahan baku belum sama dengan jumlah baris"
    },
    apply: async (w, row, journal) => {
      const dir = stockDirection(row.amount)
      for (const l of row.stock ?? [])
        await move(w, { item: l.item, in: dir === "in" ? l.qty : 0, out: dir === "out" ? l.qty : 0, value: l.value }, { date: row.date, note: noteOf(row, journal), batch: journal.id, source: { kind: "journal", journal: journal.id, number: journal.number } })
    },
    undo: async (w, row, journal) => {
      const dir = stockDirection(row.amount)
      for (const l of row.stock ?? [])
        await move(w, { item: l.item, in: dir === "out" ? l.qty : 0, out: dir === "in" ? l.qty : 0, value: l.value }, { date: row.date, note: `Batal jurnal ${noteOf(row, journal)}`, batch: journal.id, source: { kind: "journal", journal: journal.id, number: journal.number } })
    },
  },
}

const noteOf = (row: BankTransaction, journal: JournalRef) => [journal.number, row.description].filter(Boolean).join(" · ")

export const linkOptions = (type: AccountType | null) =>
  (Object.entries(LINKS) as [AccountLink, LinkRule][]).filter(([, l]) => type && l.types.includes(type)).map(([value, l]) => ({ value, label: l.label }))

/**
 * Checks the stock lines of a not yet journaled row (amount = the row's rupiah, contra = its account) and
 * returns them cleaned: qty > 0, items active and kept on that account, values adding up to the amount.
 */
export async function checkStockLines(w: Writer, lines: StockLine[], amount: number, contra: string) {
  const clean = lines.filter((l) => l.item && l.qty > 0).map((l) => ({ ...l, value: Math.round((l.value ?? 0) * 100) / 100 }))
  if (new Set(clean.map((l) => l.item)).size !== clean.length) throw new Error("Bahan baku yang sama dipilih dua kali; gabungkan jumlahnya.")
  for (const l of clean) {
    const item = await w.get<InventoryItem>(INVENTORY_ITEMS, l.item)
    if (!item?.active) throw new Error("Bahan baku tidak ada atau tidak aktif.")
    if (item.account && item.account !== contra) throw new Error(`${item.name} tercatat di akun ${item.account}, bukan ${contra}.`)
    if (l.value <= 0) throw new Error(`Nilai ${item.name} harus lebih dari 0.`)
  }
  const sum = Math.round(clean.reduce((s, l) => s + l.value, 0) * 100) / 100
  if (clean.length && sum !== Math.abs(amount)) throw new Error(`Jumlah nilai bahan baku ${formatNumber(sum)} harus sama dengan jumlah baris ${formatNumber(Math.abs(amount))}.`)
  return clean
}

/** "BB001 Benang 10 kg, BB002 Tinta 2 liter" for a row's stock lines. */
export const stockText = (lines: StockLine[] | undefined, items: Map<string, InventoryItem>) =>
  (lines ?? [])
    .map((l) => {
      const i = items.get(l.item)
      return i ? `${i.code ? `${i.code} ` : ""}${i.name} ${formatNumber(l.qty)} ${i.unit}` : `? ${formatNumber(l.qty)}`
    })
    .join(", ")
