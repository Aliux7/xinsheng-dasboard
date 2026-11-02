import {
  CUSTOMER_RECEIPTS,
  DELIVERIES,
  JOURNALS,
  SALES_ACCOUNTS as ACC,
  SALES_INVOICES,
  type CustomerReceipt,
  type Delivery,
  type Journal,
  type JournalLine,
  type Product,
  type SalesInvoice,
  type SalesLine,
} from "@/lib/collections"
import { nextDailyNumber, transaction } from "@/lib/db"
import { createDelivery, type DeliveryInput } from "@/lib/deliveries"
import { addFinishedGoods } from "@/lib/finished-goods"
import { auth } from "@/lib/firebase"
import { bankNumber, bankOf, emptyLine, ensureAccountingOpen, post, reverseIn, round2 } from "@/lib/journal"
import { statusOf } from "@/lib/purchase"
import { ensureVatOpen } from "@/lib/vat"

const jl = (account: string, debit: number, credit: number, description: string, note = ""): JournalLine => ({
  ...emptyLine(),
  account,
  description,
  debit: round2(debit),
  credit: round2(credit),
  note,
})

/** DPP = sum of lines; PPN = DPP × VAT %; total = DPP + PPN. "Pembulatan"/e-Faktur values are whole Rupiah. */
export function salesTotals(lines: Pick<SalesLine, "amount">[], vatPct: number) {
  const dpp = round2(lines.reduce((s, l) => s + (l.amount || 0), 0))
  const ppn = round2((dpp * (vatPct || 0)) / 100)
  const dppRounded = Math.round(dpp)
  return { dpp, ppn, total: round2(dpp + ppn), dppRounded, ppnEfaktur: Math.round((dppRounded * (vatPct || 0)) / 100) }
}

export type SalesInput = Pick<
  SalesInvoice,
  "customer" | "customerName" | "date" | "taxInvoiceNo" | "dueDate" | "vatPct" | "dppRounded" | "ppnEfaktur"
> &
  Required<Pick<SalesInvoice, "paymentMethod" | "bankAccount">> &
  (
    | { mode: "deliveries"; deliveries: { id: string; prices: number[] }[] }
    | { mode: "direct"; lines: SalesLine[]; shipment: Pick<DeliveryInput, "destination" | "recipientName" | "recipientAddress" | "recipientPhone" | "plate" | "container" | "driver" | "driverPhone"> }
  )

/**
 * Saves a sales invoice (YYMMDDNNN) with its journal: receivable 103101 debit (total), sales 401001
 * credit (DPP), VAT out 214001 credit (PPN), and COGS 510101 / finished goods 105301 at the cost the
 * delivery notes took out of stock. "Dari surat jalan" bills the chosen not-yet-invoiced delivery notes
 * (quantities as delivered, prices entered); "Faktur langsung" creates the delivery note for its product
 * lines in the same transaction. Stock only ever leaves through the delivery note.
 */
export function saveSalesInvoice(input: SalesInput) {
  return transaction(async (w) => {
    await ensureAccountingOpen(w, input.date)
    await ensureVatOpen(w, input.date)
    const id = w.newId(SALES_INVOICES)
    const number = await nextDailyNumber(w, "SI", input.date)
    const { customer, customerName, date, taxInvoiceNo, dueDate, vatPct, dppRounded, ppnEfaktur, paymentMethod, bankAccount } = input
    let lines: SalesLine[]
    let delivered: { id: string; number: string; cost: number }[]

    if (input.mode === "deliveries") {
      if (!input.deliveries.length) throw new Error("Pilih minimal satu surat jalan.")
      delivered = []
      lines = []
      for (const pick of input.deliveries) {
        const d = await w.get<Delivery>(DELIVERIES, pick.id)
        if (!d) throw new Error("Surat jalan tidak ditemukan.")
        if (d.customer !== input.customer) throw new Error(`${d.number} bukan milik ${input.customerName}.`)
        if (d.status !== "open") throw new Error(`${d.number} sudah ${d.status === "invoiced" ? `difakturkan (${d.invoiceNumber})` : "dibatalkan"}.`)
        d.lines.forEach((l, i) => {
          const price = pick.prices[i] ?? 0
          lines.push({ product: l.product, description: l.description, qty: l.qty, unit: l.unit, price, amount: round2(l.qty * price), delivery: d.number })
        })
        delivered.push({ id: pick.id, number: d.number, cost: d.cost })
      }
      if (lines.some((l) => !l.price)) throw new Error("Isi harga untuk setiap baris.")
    } else {
      lines = input.lines.filter((l) => l.amount)
      if (!lines.length) throw new Error("Tambahkan minimal satu baris dengan jumlah.")
      const products = lines.filter((l) => l.product && l.qty)
      delivered = []
      if (products.length) {
        const d = await createDelivery(
          w,
          { date: input.date, customer: input.customer, customerName: input.customerName, ...input.shipment, lines: products.map((l) => ({ product: l.product, qty: l.qty, unit: l.unit, sticker: "", scaleKg: null })) },
          { id, number }
        )
        delivered.push({ id: d.id, number: d.number, cost: d.cost })
        lines = lines.map((l) => (l.product && l.qty ? { ...l, delivery: d.number } : l))
      }
    }

    const { dpp, ppn, total } = salesTotals(lines, input.vatPct)
    const cogs = round2(delivered.reduce((s, d) => s + d.cost, 0))
    if (input.mode === "deliveries") {
      for (const d of delivered) await w.update(DELIVERIES, d.id, { status: "invoiced", invoiceId: id, invoiceNumber: number })
    }

    const journal = await post(
      w,
      {
        date: input.date,
        source: "sales",
        counterparty: input.customerName,
        description: `Faktur ${number}`,
        lines: [
          jl(ACC.receivable, total, 0, input.customerName),
          jl(ACC.sales, 0, dpp, lines.map((l) => l.description).join(", ")),
          ...(ppn ? [jl(ACC.vatOut, 0, ppn, `PPN ${input.vatPct}%`, input.taxInvoiceNo)] : []),
          ...(cogs ? [jl(ACC.cogs, cogs, 0, "HPP barang jadi"), jl(ACC.finishedGoods, 0, cogs, "Barang jadi terjual")] : []),
        ],
      },
      async () => number,
      { document: { type: "salesInvoice", id, number } }
    )

    await w.set(SALES_INVOICES, id, {
      customer,
      customerName,
      date,
      taxInvoiceNo,
      dueDate,
      vatPct,
      dppRounded,
      ppnEfaktur,
      paymentMethod,
      bankAccount,
      lines,
      mode: input.mode,
      number,
      dpp,
      ppn,
      total,
      payments: [],
      paid: 0,
      remaining: total,
      status: "open",
      journalId: journal.id,
      cogs,
      deliveries: delivered.map((d) => d.id),
      deliveryNumbers: delivered.map((d) => d.number),
    } satisfies Omit<SalesInvoice, "id">)
    return number
  })
}

/**
 * Cancels an invoice that has no receipts yet: its journal is reversed (same date) and its delivery
 * notes go back to "Belum difakturkan" (cancel those separately to return the stock). Older invoices,
 * made before delivery notes, put their rolls back into finished-goods stock.
 */
export function cancelSalesInvoice(id: string, reason: string) {
  return transaction(async (w) => {
    if (!reason) throw new Error("Alasan wajib diisi.")
    const inv = await w.get<SalesInvoice>(SALES_INVOICES, id)
    if (!inv) throw new Error("Faktur tidak ditemukan.")
    if (inv.status === "cancelled") throw new Error(`${inv.number} sudah dibatalkan.`)
    if (inv.paid > 0) throw new Error(`${inv.number} sudah menerima pembayaran; tidak bisa dibatalkan.`)
    await ensureVatOpen(w, inv.date)
    const journal = await w.get<Journal>(JOURNALS, inv.journalId)
    if (!journal) throw new Error(`Jurnal ${inv.number} tidak ditemukan.`)
    await reverseIn(w, { ...journal, id: inv.journalId }, inv.date, { document: { type: "salesInvoice", id, number: inv.number } })

    if (inv.deliveries) {
      for (const d of inv.deliveries) await w.update(DELIVERIES, d, { status: "open", invoiceId: "", invoiceNumber: "" })
    } else if (inv.cogs) {
      // Before delivery notes the invoice itself took the rolls: share its cost back by rolls.
      const sold = inv.lines.filter((l) => l.product && l.qty)
      const rolls = sold.reduce((s, l) => s + l.qty, 0)
      let left = inv.cogs
      for (const [i, l] of sold.entries()) {
        const cost = i === sold.length - 1 ? round2(left) : round2((inv.cogs * l.qty) / rolls)
        left -= cost
        await addFinishedGoods(w, l.product, l.qty, cost)
      }
    }

    await w.update(SALES_INVOICES, id, { status: "cancelled", remaining: 0, cancelReason: reason, cancelledBy: { email: auth.currentUser?.email ?? null } })
    return inv.number
  })
}

export type ReceiptInput = Pick<CustomerReceipt, "customer" | "customerName" | "date" | "bank" | "reference" | "allocations" | "received" | "differenceAccount">

/**
 * Saves a customer payment (BBM): bank debit (received), receivable credit (allocated);
 * any difference (bank charges, rounding) goes to the chosen account. Invoices' remaining go down.
 */
export function saveReceipt(form: ReceiptInput) {
  return transaction(async (w) => {
    await ensureAccountingOpen(w, form.date)
    const allocations = form.allocations.filter((a) => a.amount > 0).map((a) => ({ ...a, amount: round2(a.amount) }))
    if (!allocations.length) throw new Error("Pilih minimal satu faktur dan isi jumlahnya.")
    const allocated = round2(allocations.reduce((s, a) => s + a.amount, 0))
    const difference = round2(allocated - form.received)
    if (difference && !form.differenceAccount) throw new Error("Ada selisih; pilih akun selisih (mis. biaya bank).")
    const invoices = await Promise.all(allocations.map((a) => w.get<SalesInvoice>(SALES_INVOICES, a.invoice)))
    const id = w.newId(CUSTOMER_RECEIPTS)
    const number = await bankNumber(w, form.bank, "BBM", form.date)

    for (const [i, a] of allocations.entries()) {
      const invoice = invoices[i]
      if (!invoice) throw new Error(`Faktur ${a.number} tidak ditemukan.`)
      if (a.amount > invoice.remaining + 0.005) throw new Error(`${a.number}: sisa hanya ${invoice.remaining.toLocaleString("id-ID")}.`)
      const paid = round2(invoice.paid + a.amount)
      await w.update(SALES_INVOICES, a.invoice, {
        payments: [...invoice.payments, { date: form.date, amount: a.amount, paymentId: id, number }],
        paid,
        remaining: round2(invoice.total - paid),
        status: statusOf(invoice.total, paid),
      })
    }

    const text = `Penerimaan ${allocations.map((a) => a.number).join(", ")}${form.reference ? ` (${form.reference})` : ""}`
    const journal = await post(
      w,
      {
        date: form.date,
        source: form.bank,
        counterparty: form.customerName,
        description: text,
        lines: [
          jl(bankOf(form.bank).account, form.received, 0, text, form.reference),
          ...(difference ? [jl(form.differenceAccount, difference > 0 ? difference : 0, difference < 0 ? -difference : 0, "Selisih penerimaan")] : []),
          jl(ACC.receivable, 0, allocated, text),
        ],
      },
      async () => number,
      { document: { type: "customerReceipt", id, number } }
    )

    await w.set(CUSTOMER_RECEIPTS, id, { ...form, allocations, allocated, difference, number, journalId: journal.id } satisfies Omit<CustomerReceipt, "id">)
    return number
  })
}

/** "A2B · 4x50m · Biru 蓝" */
export const productLabel = (p: Product) => [p.type, p.size, p.colour].filter(Boolean).join(" · ")
