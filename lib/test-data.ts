import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore"

import type { StockLine } from "@/lib/account-links"
import { BANKS, BANK_TRANSACTIONS, VOUCHER_NUMBER, type Bank, type BankTransaction } from "@/lib/bank-book"
import { transaction } from "@/lib/db"
import { DEPARTMENTS, type Department } from "@/lib/departments"
import { db } from "@/lib/firebase"
import { INVENTORY_ITEMS, INVENTORY_MOVEMENTS, move, type InventoryItem, type InventoryMovement } from "@/lib/inventory"
import { JOURNALS, OPENING_TEST_ID, type Journal } from "@/lib/journal"

/**
 * Test data ("data uji"): everything hanging off a bank whose account no. starts with UJI-, an item whose
 * code starts with UJI- or a department whose code starts with UJI. `findTestData` lists it and
 * `clearTestData` deletes it (Developer only; firestore.rules refuse deleting anything not marked UJI).
 * Also deleted: the HPP journals of the months the test data is in (worked out from it) and the test
 * Saldo awal (OPENING_TEST_ID); the real Saldo awal is never touched. Accounts, report lines and the
 * change log are never deleted.
 */
export const TEST_BANK = /^UJI-/i
export const TEST_ITEM = /^UJI-/i
export const TEST_DEPARTMENT = /^UJI/i

export type TestData = {
  banks: Bank[]
  rows: BankTransaction[]
  journals: Journal[]
  counters: string[]
  items: InventoryItem[]
  movements: InventoryMovement[]
  departments: Department[]
  /** HPP bulanan journals of the months with test rows or test stock movements. */
  cogs: Journal[]
  /** The test Saldo awal journal, if any. */
  opening: Journal | null
}

const all = async <T>(path: string, ...filters: Parameters<typeof where>[]) =>
  (await getDocs(query(collection(db, path), ...filters.map((f) => where(...f))))).docs.map((d) => ({ id: d.id, ...d.data() }) as T)

/** `in` queries take at most 30 values. */
async function allIn<T>(path: string, field: string, values: string[]) {
  const out: T[] = []
  for (let i = 0; i < values.length; i += 30) out.push(...(await all<T>(path, [field, "in", values.slice(i, i + 30)])))
  return out
}

export async function findTestData(): Promise<TestData> {
  const banks = (await all<Bank>(BANKS)).filter((b) => TEST_BANK.test(b.accountNo ?? ""))
  const items = (await all<InventoryItem>(INVENTORY_ITEMS)).filter((i) => TEST_ITEM.test(i.code ?? ""))
  const departments = (await all<Department>(DEPARTMENTS)).filter((d) => TEST_DEPARTMENT.test(d.code))
  const bankIds = banks.map((b) => b.id)
  const rows = await allIn<BankTransaction>(BANK_TRANSACTIONS, "bank", bankIds)
  const journals = await allIn<Journal>(JOURNALS, "source.bank", bankIds)
  const movements = await allIn<InventoryMovement>(INVENTORY_MOVEMENTS, "item", items.map((i) => i.id))
  const counters = [
    ...new Set(
      rows.flatMap((r) => {
        const m = r.number.match(VOUCHER_NUMBER)
        return m ? [`BB${m[1].toUpperCase()}-${r.bank}-20${m[2]}-${m[3]}`] : []
      })
    ),
  ]
  const months = [...new Set([...rows.map((r) => r.date.slice(0, 7)), ...movements.map((m) => m.date.slice(0, 7))])]
  const one = async (id: string) => {
    const snap = await getDoc(doc(db, JOURNALS, id))
    return snap.exists() ? ({ id: snap.id, ...snap.data() } as Journal) : null
  }
  const cogs = (await Promise.all(months.map((m) => one(`HPP-${m}`)))).filter((j): j is Journal => !!j)
  return { banks, rows, journals, counters, items, movements, departments, cogs, opening: await one(OPENING_TEST_ID) }
}

/** Deletes per transaction (each delete is a write plus its log entry; Firestore allows 500). */
const CHUNK = 200

/**
 * Deletes the test data. Journals first: stock their bank rows moved on real (non-UJI) items is moved
 * back, since only UJI items and their movements are deleted. Returns how many documents went.
 */
export async function clearTestData(data: TestData) {
  const testItems = new Set(data.items.map((i) => i.id))
  const rowById = new Map(data.rows.map((r) => [r.id, r]))
  let deleted = 0

  const derived = [...data.cogs, ...(data.opening ? [data.opening] : [])]
  if (derived.length)
    await transaction(async (w) => {
      for (const j of derived) if (await w.get(JOURNALS, j.id)) await w.remove(JOURNALS, j.id)
    })
  deleted += derived.length

  for (const j of data.journals) {
    await transaction(async (w) => {
      for (const l of j.links ?? []) {
        const row = rowById.get(l.row)
        const real: StockLine[] = (row?.stock ?? []).filter((s) => !testItems.has(s.item))
        if (l.link !== "inventory" || !row || !real.length) continue
        const back = row.amount < 0 ? "out" : "in"
        for (const s of real)
          await move(w, { item: s.item, in: back === "in" ? s.qty : 0, out: back === "out" ? s.qty : 0 }, { date: row.date, note: `Hapus data uji ${j.number}`, batch: j.id })
      }
      await w.remove(JOURNALS, j.id)
    })
    deleted++
  }

  const docs: [string, string][] = [
    ...data.rows.map((r) => [BANK_TRANSACTIONS, r.id] as [string, string]),
    ...data.counters.map((id) => ["counters", id] as [string, string]),
    ...data.movements.map((m) => [INVENTORY_MOVEMENTS, m.id] as [string, string]),
    ...data.items.flatMap((i) => [[INVENTORY_ITEMS, i.id], ...(i.code ? [["inventoryCodes", i.code]] : [])] as [string, string][]),
    ...data.departments.map((d) => [DEPARTMENTS, d.id] as [string, string]),
    ...data.banks.map((b) => [BANKS, b.id] as [string, string]),
  ]
  for (let i = 0; i < docs.length; i += CHUNK) {
    await transaction(async (w) => {
      for (const [path, id] of docs.slice(i, i + CHUNK)) if (await w.get(path, id)) await w.remove(path, id)
    })
    deleted += Math.min(CHUNK, docs.length - i)
  }
  return deleted
}
