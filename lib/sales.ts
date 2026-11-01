import {
  CUSTOMER_RECEIPTS,
  SALES_ACCOUNTS as ACC,
  SALES_INVOICES,
  type CustomerReceipt,
  type JournalLine,
  type Product,
  type SalesInvoice,
  type SalesLine,
} from "@/lib/collections"
import { nextNumber, transaction } from "@/lib/db"
import { takeFinishedGoods } from "@/lib/finished-goods"
import { bankNumber, bankOf, emptyLine, ensureAccountingOpen, post, round2 } from "@/lib/journal"
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

export type SalesInput = Pick<SalesInvoice, "customer" | "customerName" | "date" | "taxInvoiceNo" | "dueDate" | "lines" | "vatPct" | "dppRounded" | "ppnEfaktur">

/**
 * Saves a sales invoice (INV/…) with its journal: receivable 103101 debit (total), sales 401001
 * credit (DPP), VAT out 214001 credit (PPN). Product rolls leave finished-goods stock at average
 * cost, posted as COGS 510101 / finished goods 105301.
 */
export function saveSalesInvoice(form: SalesInput) {
  return transaction(async (w) => {
    await ensureAccountingOpen(w, form.date)
    await ensureVatOpen(w, form.date)
    const lines = form.lines.filter((l) => l.amount)
    if (!lines.length) throw new Error("Tambahkan minimal satu baris dengan jumlah.")
    const { dpp, ppn, total } = salesTotals(lines, form.vatPct)
    const id = w.newId(SALES_INVOICES)
    const number = await nextNumber(w, "INV", form.date)

    let cogs = 0
    for (const l of lines) if (l.product && l.qty) cogs = round2(cogs + (await takeFinishedGoods(w, l.product, l.qty)))

    const journal = await post(
      w,
      {
        date: form.date,
        source: "sales",
        counterparty: form.customerName,
        description: `Faktur ${number}`,
        lines: [
          jl(ACC.receivable, total, 0, form.customerName),
          jl(ACC.sales, 0, dpp, lines.map((l) => l.description).join(", ")),
          ...(ppn ? [jl(ACC.vatOut, 0, ppn, `PPN ${form.vatPct}%`, form.taxInvoiceNo)] : []),
          ...(cogs ? [jl(ACC.cogs, cogs, 0, "HPP barang jadi"), jl(ACC.finishedGoods, 0, cogs, "Barang jadi terjual")] : []),
        ],
      },
      async () => number,
      { document: { type: "salesInvoice", id, number } }
    )

    await w.set(SALES_INVOICES, id, {
      ...form,
      lines,
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
    } satisfies Omit<SalesInvoice, "id">)
    return number
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
