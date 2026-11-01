import { FG_PRODUCTIONS, INVENTORY_ACCOUNTS, PRODUCTS, ROLLS, type FgProduction, type Product, type Roll } from "@/lib/collections"
import { nextNumber, transaction, type Writer } from "@/lib/db"
import { emptyLine, ensureAccountingOpen, post, round2 } from "@/lib/journal"

/** Adds produced rolls (and their cost) to a product's finished-goods stock. */
export async function addFinishedGoods(w: Writer, product: string, rolls: number, value: number) {
  const p = await w.get<Product>(PRODUCTS, product)
  if (!p) throw new Error(`Produk ${product} tidak ditemukan.`)
  await w.update(PRODUCTS, product, { fgQty: (p.fgQty ?? 0) + rolls, fgValue: round2((p.fgValue ?? 0) + value) })
}

/** Takes sold rolls out of finished-goods stock at average cost; returns that cost. Refuses if not enough. */
export async function takeFinishedGoods(w: Writer, product: string, rolls: number) {
  const p = await w.get<Product>(PRODUCTS, product)
  if (!p) throw new Error(`Produk ${product} tidak ditemukan.`)
  const qty = p.fgQty ?? 0
  if (rolls > qty) throw new Error(`Stok barang jadi ${product} tidak cukup. Tersedia ${qty} roll, diminta ${rolls} roll. Catat produksinya di Barang jadi.`)
  const cost = qty ? round2(((p.fgValue ?? 0) / qty) * rolls) : 0
  await w.update(PRODUCTS, product, { fgQty: qty - rolls, fgValue: round2((p.fgValue ?? 0) - cost) })
  return cost
}

/**
 * Finished-goods production (FG/…): cloth rolls (issued to lamination, not yet used) become
 * product rolls. Value = cloth kg × cost per kg; journal finished goods 105301 / WIP 105201.
 */
export function saveProduction(form: { date: string; product: string; rolls: number; clothRolls: string[]; costPerKg: number }) {
  return transaction(async (w) => {
    await ensureAccountingOpen(w, form.date)
    if (form.rolls <= 0) throw new Error("Jumlah roll produksi harus lebih dari 0.")
    if (!form.clothRolls.length) throw new Error("Pilih roll kain yang dipakai.")
    const cloth = await Promise.all(form.clothRolls.map((id) => w.get<Roll>(ROLLS, id)))
    for (const [i, r] of cloth.entries()) {
      if (!r || r.status !== "issued") throw new Error(`Roll ${form.clothRolls[i]} belum dikeluarkan ke laminasi.`)
      if (r.usedIn) throw new Error(`Roll ${r.number} sudah dipakai.`)
    }
    const clothKg = round2(cloth.reduce((s, r) => s + (r?.kg ?? 0), 0))
    const value = round2(clothKg * (form.costPerKg || 0))
    const id = w.newId(FG_PRODUCTIONS)
    const number = await nextNumber(w, "FG", form.date)
    for (const rollId of form.clothRolls) await w.update(ROLLS, rollId, { usedIn: id })
    await addFinishedGoods(w, form.product, form.rolls, value)
    let journalId = ""
    if (value > 0) {
      const text = `Produksi ${form.rolls} roll ${form.product}`
      const journal = await post(
        w,
        {
          date: form.date,
          source: "gl",
          counterparty: "",
          description: text,
          lines: [
            { ...emptyLine(), account: INVENTORY_ACCOUNTS.finishedGoods, description: text, debit: value },
            { ...emptyLine(), account: INVENTORY_ACCOUNTS.wip, description: text, credit: value },
          ],
        },
        async () => number,
        { document: { type: "fgProduction", id, number } }
      )
      journalId = journal.id
    }
    await w.set(FG_PRODUCTIONS, id, { ...form, number, clothKg, value, journalId } satisfies Omit<FgProduction, "id">)
    return number
  })
}
