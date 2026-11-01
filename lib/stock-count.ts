import { MATERIALS, STOCK_COUNTS, type Material, type StockCount } from "@/lib/collections"
import { nextNumber, transaction, type Writer } from "@/lib/db"
import { auth } from "@/lib/firebase"
import { ensureOpen } from "@/lib/period"
import { addStock, round3 } from "@/lib/stock"

/** Differences above 1% of the balance or above 500 kg need Admin approval. */
export const APPROVAL_KG = 500
export const APPROVAL_PCT = 1

export const needsApproval = (difference: number, systemBalance: number) =>
  Math.abs(difference) > APPROVAL_KG || Math.abs(difference) > (Math.abs(systemBalance) * APPROVAL_PCT) / 100

const me = () => ({ uid: auth.currentUser!.uid, email: auth.currentUser!.email })

/** Posts the adjustment so the stock moves by the counted difference. */
async function post(w: Writer, id: string, count: Omit<StockCount, "id">) {
  if (count.difference) {
    await addStock(w, {
      kind: "adjustment",
      material: count.material,
      date: count.date,
      qty: count.difference,
      source: { type: "stockCount", id, number: count.number },
    })
  }
}

/**
 * Saves a count. The difference is counted − stock at this moment. Within the limit
 * (or when an Admin saves it) it's posted at once; otherwise it waits for approval.
 */
export function saveCount(form: { date: string; material: string; counted: number; reason: string }, isAdmin: boolean) {
  return transaction(async (w) => {
    await ensureOpen(w, form.date)
    const material = await w.get<Material>(MATERIALS, form.material)
    if (!material) throw new Error(`Bahan baku ${form.material} tidak ditemukan.`)
    const systemBalance = material.stock ?? 0
    const difference = round3(form.counted - systemBalance)
    const big = needsApproval(difference, systemBalance)
    const status = big && !isAdmin ? "pending" : "posted"

    const id = w.newId(STOCK_COUNTS)
    const count: Omit<StockCount, "id"> = {
      ...form,
      number: await nextNumber(w, "ADJ", form.date),
      systemBalance,
      difference,
      status,
      countedBy: me(),
      approvedBy: big && isAdmin ? me() : null,
      rejectReason: "",
    }
    await w.set(STOCK_COUNTS, id, count)
    if (status === "posted") await post(w, id, count)
    return count
  })
}

/** Admin only (enforced by firestore.rules): posts a waiting count's original difference. */
export function approveCount(id: string) {
  return transaction(async (w) => {
    const count = await w.get<Omit<StockCount, "id">>(STOCK_COUNTS, id)
    if (count?.status !== "pending") throw new Error("Hitungan ini tidak sedang menunggu persetujuan.")
    await w.update(STOCK_COUNTS, id, { status: "posted", approvedBy: me() })
    await post(w, id, count)
  })
}

export function rejectCount(id: string, reason: string) {
  return transaction(async (w) => {
    const count = await w.get<Omit<StockCount, "id">>(STOCK_COUNTS, id)
    if (count?.status !== "pending") throw new Error("Hitungan ini tidak sedang menunggu persetujuan.")
    await ensureOpen(w, count.date)
    await w.update(STOCK_COUNTS, id, { status: "rejected", approvedBy: me(), rejectReason: reason })
  })
}
