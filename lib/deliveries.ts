import {
  DELIVERIES,
  PRODUCTS,
  type Customer,
  type Delivery,
  type DeliveryLine,
  type Product,
} from "@/lib/collections"
import { nextDailyNumber, transaction, type Writer } from "@/lib/db"
import { addFinishedGoods, takeFinishedGoods } from "@/lib/finished-goods"
import { auth } from "@/lib/firebase"
import { round2 } from "@/lib/journal"
import { ensureOpen } from "@/lib/period"
import { round3 } from "@/lib/stock"

const CJK = /[⺀-鿿豈-﫿＀-￯]+/g
const kg = (n: number | null) => (n == null ? "" : n.toLocaleString("id-ID", { maximumFractionDigits: 3 }))

/** Text with Chinese characters removed, for Indonesian documents. */
export const withoutChinese = (text: string) => text.replace(CJK, " ").replace(/\s+/g, " ").trim()

/**
 * Colour parts, as in the client's sheet: Indonesian "SKYBLUE / SILVER", Chinese "天蓝银" and its code "SBS".
 * The Chinese text (with the code) is `colourZh`, else the part of `colour` from its first Chinese character
 * (the import stores "SKYBLUE / SILVER 天蓝银 SBS"). The code never prints on the Indonesian side.
 */
export function colourParts(p: Pick<Product, "colour" | "colourZh">) {
  const colour = p.colour.trim()
  const first = colour.search(new RegExp(CJK.source))
  const zhText = p.colourZh?.trim() || (first >= 0 ? colour.slice(first) : "")
  const zh = (zhText.match(CJK) ?? []).join(" ")
  const code = withoutChinese(zhText)
  const codes = new Set(code.split(" ").filter(Boolean))
  const idText = p.colourZh?.trim() && colour.includes(p.colourZh.trim()) ? colour.replace(p.colourZh.trim(), " ") : first > 0 ? colour.slice(0, first) : colour
  const id = withoutChinese(idText).split(" ").filter((t) => !codes.has(t)).join(" ")
  return { id, zh: zh || id, code }
}

/** "TERPAL A2B 4X50m SKYBLUE / SILVER (16 Kg)", as on the delivery note and invoice (no colour code). */
export function printName(p: Product) {
  return ["TERPAL", p.type, p.size, colourParts(p).id, p.grossKg != null ? `(${kg(p.grossKg)} Kg)` : ""].filter(Boolean).join(" ")
}

/** "灰布 A2B 4X50m 天蓝银 SBS 16 Kg" (loom cloth, type, size, Chinese colour, colour code, gross kg); " = 1支" is added when printed. */
export function printNameZh(p: Product) {
  const { zh, code } = colourParts(p)
  return [p.loom, p.type, p.size, zh, code, p.grossKg != null ? `${kg(p.grossKg)} Kg` : ""].filter(Boolean).join(" ")
}

export type LineInput = Pick<DeliveryLine, "product" | "qty" | "unit" | "sticker" | "scaleKg">

/** Per line: net/gross = qty × product kg; with a scale weight: average per roll, overweight kg and % of net. */
export function lineWeights(line: Pick<DeliveryLine, "qty" | "scaleKg">, rollNetKg: number, rollGrossKg: number) {
  const netKg = round3(line.qty * rollNetKg)
  const grossKg = round3(line.qty * rollGrossKg)
  const scale = line.scaleKg
  return {
    netKg,
    grossKg,
    averageKg: scale != null && line.qty ? round2(scale / line.qty) : null,
    overKg: scale != null ? round3(scale - grossKg) : null,
    overPct: scale != null && netKg ? (scale - grossKg) / netKg : null,
  }
}

/** Totals of a delivery note; scale and overweight are null when no line has a scale weight. */
export function deliveryTotals(lines: Pick<DeliveryLine, "qty" | "netKg" | "grossKg" | "scaleKg">[]) {
  const sum = (f: (l: (typeof lines)[number]) => number) => round3(lines.reduce((s, l) => s + f(l), 0))
  const weighed = lines.filter((l) => l.scaleKg != null)
  return {
    totalQty: sum((l) => l.qty),
    totalNet: sum((l) => l.netKg),
    totalGross: sum((l) => l.grossKg),
    totalScale: weighed.length ? sum((l) => l.scaleKg ?? 0) : null,
    overweight: weighed.length ? round3(weighed.reduce((s, l) => s + (l.scaleKg ?? 0) - l.grossKg, 0)) : null,
  }
}

/** Delivery fields that default from the customer (editable on the form). */
export const shipmentOf = (c?: Customer) => ({
  destination: c?.city ?? "",
  recipientName: c?.recipientName ?? "",
  recipientAddress: c?.recipientAddress || c?.address || "",
  recipientPhone: c?.recipientPhone || c?.phone || "",
})

export type DeliveryInput = Pick<
  Delivery,
  "date" | "customer" | "customerName" | "destination" | "recipientName" | "recipientAddress" | "recipientPhone" | "plate" | "container" | "driver" | "driverPhone"
> & { lines: LineInput[] }

/**
 * Creates a delivery note inside an open transaction: finished-goods stock goes down per product
 * (refused if not enough) at average cost. A direct sales invoice passes `invoice` so it is billed at once.
 */
export async function createDelivery(w: Writer, input: DeliveryInput, invoice?: { id: string; number: string }) {
  await ensureOpen(w, input.date)
  const wanted = input.lines.filter((l) => l.product && l.qty > 0)
  if (!wanted.length) throw new Error("Tambahkan minimal satu baris produk dengan jumlah.")
  const lines: DeliveryLine[] = []
  for (const l of wanted) {
    const p = await w.get<Product>(PRODUCTS, l.product)
    if (!p) throw new Error(`Produk ${l.product} tidak ditemukan.`)
    const rollNetKg = p.netKg ?? 0
    const rollGrossKg = p.grossKg ?? rollNetKg
    const { netKg, grossKg } = lineWeights(l, rollNetKg, rollGrossKg)
    const cost = await takeFinishedGoods(w, l.product, l.qty)
    lines.push({
      product: l.product,
      description: printName(p),
      descriptionZh: printNameZh(p),
      qty: l.qty,
      unit: l.unit.trim() || "ROLL",
      sticker: l.sticker.trim(),
      rollNetKg,
      rollGrossKg,
      netKg,
      grossKg,
      scaleKg: l.scaleKg,
      cost,
    })
  }
  const id = w.newId(DELIVERIES)
  const number = `DO-${await nextDailyNumber(w, "DO", input.date)}`
  const delivery: Omit<Delivery, "id"> = {
    ...input,
    lines,
    ...deliveryTotals(lines),
    number,
    cost: round2(lines.reduce((s, l) => s + l.cost, 0)),
    status: invoice ? "invoiced" : "open",
    invoiceId: invoice?.id ?? "",
    invoiceNumber: invoice?.number ?? "",
    cancelReason: "",
    cancelledBy: null,
  }
  await w.set(DELIVERIES, id, delivery)
  return { id, ...delivery }
}

export function saveDelivery(input: DeliveryInput) {
  return transaction(async (w) => (await createDelivery(w, input)).number)
}

/** Only while not invoiced: the rolls go back to finished-goods stock at the cost they left with. */
export function cancelDelivery(id: string, reason: string) {
  return transaction(async (w) => {
    if (!reason) throw new Error("Alasan wajib diisi.")
    const d = await w.get<Delivery>(DELIVERIES, id)
    if (!d) throw new Error("Surat jalan tidak ditemukan.")
    if (d.status !== "open") throw new Error(`${d.number} sudah ${d.status === "invoiced" ? `difakturkan (${d.invoiceNumber}); batalkan fakturnya dulu` : "dibatalkan"}.`)
    await ensureOpen(w, d.date)
    for (const l of d.lines) await addFinishedGoods(w, l.product, l.qty, l.cost)
    await w.update(DELIVERIES, id, { status: "cancelled", cancelReason: reason, cancelledBy: { email: auth.currentUser?.email ?? null } })
    return d.number
  })
}

/** Live check for a form: one message per product whose lines ask for more rolls than its finished-goods stock. */
export function fgStockErrors(lines: { product: string; qty: number }[], products: Product[]) {
  const wanted = new Map<string, number>()
  for (const l of lines) if (l.product && l.qty > 0) wanted.set(l.product, (wanted.get(l.product) ?? 0) + l.qty)
  return [...wanted].flatMap(([code, qty]) => {
    const available = products.find((p) => p.code === code)?.fgQty ?? 0
    return qty > available ? [`Stok barang jadi ${code} tidak cukup. Tersedia ${available} roll, diminta ${qty} roll.`] : []
  })
}
