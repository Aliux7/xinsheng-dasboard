import {
  collection,
  doc,
  runTransaction,
  serverTimestamp,
  type DocumentData,
  type Timestamp,
} from "firebase/firestore"

import { auth, db } from "@/lib/firebase"

/**
 * Write helpers. Use these instead of Firestore's setDoc/updateDoc/deleteDoc:
 * every write and its entry in the `logs` collection commit together in one
 * transaction, which is what the Riwayat perubahan page shows.
 *
 * - One document: `addRecord` / `updateRecord` / `deleteRecord`.
 * - Several documents that must change together (e.g. a weighing + stock):
 *   `transaction(async (w) => { … w.get / w.set / w.update … })`.
 */

export type Change = { from: unknown; to: unknown }

export const ACTION_LABELS = { create: "Buat", update: "Ubah", delete: "Hapus" } as const

export type Log = {
  id: string
  collection: string
  docId: string
  action: "create" | "update" | "delete"
  changes: Record<string, Change>
  by: { uid: string; email: string | null }
  at: Timestamp | null
}

function diff(before: DocumentData = {}, after: DocumentData = {}) {
  const changes: Record<string, Change> = {}
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      changes[key] = { from: before[key] ?? null, to: after[key] ?? null }
    }
  }
  return changes
}

/** `silent` skips the log entry, e.g. for number counters. */
type WriteOptions = { silent?: boolean }

export type Writer = {
  /** Reads a document inside the transaction (sees this transaction's own earlier writes). */
  get: <T = DocumentData>(path: string, id: string) => Promise<T | undefined>
  set: (path: string, id: string, data: DocumentData, options?: WriteOptions) => Promise<void>
  update: (path: string, id: string, patch: DocumentData, options?: WriteOptions) => Promise<void>
  remove: (path: string, id: string) => Promise<void>
  /** A fresh document id for `path`. */
  newId: (path: string) => string
}

/**
 * Runs `fn` as one all-or-nothing transaction; every write is logged with its before/after
 * values. `silent` skips the per-write log (bulk imports write one summary entry instead).
 */
export async function transaction<R>(fn: (w: Writer) => Promise<R>, txOptions: WriteOptions = {}): Promise<R> {
  const user = auth.currentUser
  if (!user) throw new Error("Belum masuk")

  return runTransaction(db, async (tx) => {
    // Firestore needs every read before any write, so writes are queued and applied at the end.
    const cache = new Map<string, DocumentData | undefined>()
    const queue: (() => void)[] = []

    const read = async (path: string, id: string) => {
      const key = `${path}/${id}`
      if (!cache.has(key)) cache.set(key, (await tx.get(doc(db, path, id))).data())
      return cache.get(key)
    }

    const write = async (
      path: string,
      id: string,
      after: DocumentData | undefined,
      apply: () => void,
      options: WriteOptions = txOptions
    ) => {
      const before = await read(path, id)
      cache.set(`${path}/${id}`, after)
      queue.push(() => {
        apply()
        const changes = diff(before, after)
        if (options.silent || !Object.keys(changes).length) return
        tx.set(doc(collection(db, "logs")), {
          collection: path,
          docId: id,
          action: !before ? "create" : !after ? "delete" : "update",
          changes,
          by: { uid: user.uid, email: user.email },
          at: serverTimestamp(),
        } satisfies Omit<Log, "id" | "at"> & { at: unknown })
      })
    }

    const w: Writer = {
      get: (path, id) => read(path, id) as never,
      set: (path, id, data, options) => write(path, id, data, () => tx.set(doc(db, path, id), data), options),
      update: async (path, id, patch, options) => {
        const before = await read(path, id)
        if (!before) throw new Error(`${id} tidak ditemukan.`)
        await write(path, id, { ...before, ...patch }, () => tx.update(doc(db, path, id), patch), options)
      },
      remove: (path, id) => write(path, id, undefined, () => tx.delete(doc(db, path, id))),
      newId: (path) => doc(collection(db, path)).id,
    }

    const result = await fn(w)
    queue.forEach((apply) => apply())
    return result
  })
}

/** Creates a document; fails if `id` is taken. Pass `id` to choose it, e.g. a user's UID or a code. */
export function addRecord(path: string, data: DocumentData, id = doc(collection(db, path)).id) {
  return transaction(async (w) => {
    if (await w.get(path, id)) throw new Error(`${id} sudah ada.`)
    await w.set(path, id, data)
    return id
  })
}

export function updateRecord(path: string, id: string, patch: DocumentData) {
  return transaction((w) => w.update(path, id, patch))
}

export function deleteRecord(path: string, id: string) {
  return transaction((w) => w.remove(path, id))
}

/**
 * Document number in the company's format: PREFIX/YY + month letter (A = Jan … L = Dec)
 * + 5 digits, e.g. TM/26J00001 for the first truck of October 2026.
 */
export function formatDocNumber(prefix: string, date: string, seq: number) {
  const [year, month] = date.split("-")
  return `${prefix}/${year.slice(2)}${"ABCDEFGHIJKL"[Number(month) - 1]}${String(seq).padStart(5, "0")}`
}

/** Counter document for a prefix and month: `counters/{PREFIX-YYYY-MM}` = { last }. */
export const counterId = (prefix: string, date: string) => `${prefix}-${date.slice(0, 7)}`

/** Next document number for a prefix and month; call inside the same transaction as the save. */
export async function nextNumber(w: Writer, prefix: string, date: string) {
  const id = counterId(prefix, date)
  const last = (await w.get<{ last: number }>("counters", id))?.last ?? 0
  await w.set("counters", id, { last: last + 1 }, { silent: true })
  return formatDocNumber(prefix, date, last + 1)
}
