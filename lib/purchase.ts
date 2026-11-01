import { serverTimestamp } from "firebase/firestore"

import {
  IMPORT_PURCHASES,
  MATCH_TOLERANCE,
  MATERIAL_MAPS,
  PAYMENT_APPROVAL_LIMIT,
  PURCHASE_ACCOUNTS as ACC,
  PURCHASE_INVOICES,
  SUPPLIER_PAYMENTS,
  WEIGHINGS,
  type ImportPurchase,
  type MaterialMap,
  type InvoiceStatus,
  type JournalLine,
  type PurchaseInvoice,
  type PurchaseLine,
  type SupplierPayment,
  type Weighing,
  type Withholding,
} from "@/lib/collections"
import { nextNumber, transaction, type Writer } from "@/lib/db"
import { auth } from "@/lib/firebase"
import { bankNumber, bankOf, emptyLine, ensureAccountingOpen, post, round2 } from "@/lib/journal"
import { ensureVatOpen } from "@/lib/vat"

const me = () => ({ uid: auth.currentUser!.uid, email: auth.currentUser!.email })
const jl = (account: string, debit: number, credit: number, description: string, note = ""): JournalLine => ({
  ...emptyLine(),
  account,
  description,
  debit: round2(debit),
  credit: round2(credit),
  note,
})

/** "2026-10-31" + 30 days → "2026-11-30" (calendar maths, no clock). */
export function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** DPP = sum of lines; PPN = DPP × VAT %; PPh = DPP × withholding %; payable = DPP + PPN − PPh. */
export function invoiceTotals(lines: Pick<PurchaseLine, "amount">[], vatPct: number, withholding: Withholding, whtPct: number) {
  const dpp = round2(lines.reduce((s, l) => s + (l.amount || 0), 0))
  const ppn = round2((dpp * (vatPct || 0)) / 100)
  const pph = withholding === "none" ? 0 : round2((dpp * (whtPct || 0)) / 100)
  return { dpp, ppn, pph, payable: round2(dpp + ppn - pph) }
}

export const statusOf = (payable: number, paid: number): InvoiceStatus =>
  paid <= 0 ? "open" : paid >= payable - 0.005 ? "paid" : "partial"

export type InvoiceInput = Omit<
  PurchaseInvoice,
  "id" | "number" | "dpp" | "ppn" | "pph" | "payable" | "payableAccount" | "payments" | "paid" | "remaining" | "status" | "journalId"
>

/**
 * Saves a purchase invoice (PI/…) and its journal together: each line's account debit,
 * VAT in 107001 debit, PPh payable credit, trade payable 211101 credit.
 */
export function savePurchaseInvoice(form: InvoiceInput) {
  return transaction(async (w) => {
    await ensureAccountingOpen(w, form.date)
    await ensureVatOpen(w, form.date)
    const lines = form.lines.filter((l) => l.account && l.amount)
    if (!lines.length) throw new Error("Tambahkan minimal satu baris dengan akun dan jumlah.")
    const { dpp, ppn, pph, payable } = invoiceTotals(lines, form.vatPct, form.withholding, form.whtPct)
    const id = w.newId(PURCHASE_INVOICES)
    const number = await nextNumber(w, "PI", form.date)
    const text = `${form.supplierName} ${form.supplierInvoiceNo}`.trim()

    const journal = await post(
      w,
      {
        date: form.date,
        source: "purchase",
        counterparty: form.supplierName,
        description: `Faktur ${form.supplierInvoiceNo || number}`,
        lines: [
          ...lines.map((l) => jl(l.account, l.amount, 0, l.description || text)),
          ...(ppn ? [jl(ACC.vatIn, ppn, 0, `PPN ${form.vatPct}%`, form.taxInvoiceNo)] : []),
          ...(pph ? [jl(form.withholding === "pph23" ? ACC.pph23Payable : ACC.pph42Payable, 0, pph, `${form.withholding === "pph23" ? "PPh 23" : "PPh 4(2)"} ${form.whtPct}%`)] : []),
          jl(ACC.payableIdr, 0, payable, text),
        ],
      },
      async () => number,
      { document: { type: "purchaseInvoice", id, number } }
    )

    // Weighings this invoice pays for: invoiced kg (mapped lines) vs weighed kg.
    const match = await matchWeighings(w, id, form.supplier, form.weighings ?? [], lines)

    await w.set(PURCHASE_INVOICES, id, {
      ...form,
      ...match,
      lines,
      number,
      dpp,
      ppn,
      pph,
      payable,
      payableAccount: ACC.payableIdr,
      payments: [],
      paid: 0,
      remaining: payable,
      status: "open",
      journalId: journal.id,
    } satisfies Omit<PurchaseInvoice, "id">)
    return number
  })
}

export type ImportInput = Omit<ImportPurchase, "id" | "number" | "customsValueRp" | "totalTax" | "journalId">

/** Rupiah figures of an import, and the gap between customs value and invoice × rate (freight, insurance…). */
export function importTotals(f: Pick<ImportInput, "customsValue" | "rate" | "invoiceAmount" | "duty" | "pph22" | "importVat">) {
  const customsValueRp = round2((f.customsValue || 0) * (f.rate || 0))
  const payable = round2((f.invoiceAmount || 0) * (f.rate || 0))
  const totalTax = round2((f.duty || 0) + (f.pph22 || 0) + (f.importVat || 0))
  return { customsValueRp, payable, totalTax, difference: round2(customsValueRp - payable) }
}

/**
 * Saves an import (PIB/…) and its journal: goods debit (customs value + duty), PPh 22 prepaid
 * and import VAT debit; seller payable credit (invoice × rate); taxes paid credit bank.
 */
export function saveImportPurchase(form: ImportInput) {
  return transaction(async (w) => {
    await ensureAccountingOpen(w, form.pibDate)
    await ensureVatOpen(w, form.pibDate)
    const { customsValueRp, payable, totalTax, difference } = importTotals(form)
    if (difference && !form.differenceAccount) throw new Error("Pilih akun untuk selisih nilai pabean dan invoice × kurs.")
    const id = w.newId(IMPORT_PURCHASES)
    const number = await nextNumber(w, "PIB", form.pibDate)
    const text = `PIB ${form.nopen} ${form.goods}`.trim()
    const bank = bankOf(form.bank).account

    const journal = await post(
      w,
      {
        date: form.pibDate,
        source: "purchase",
        counterparty: form.seller,
        description: text,
        lines: [
          jl(form.goodsAccount, customsValueRp + form.duty, 0, text, form.duty ? `Termasuk BM ${form.duty.toLocaleString("id-ID")}` : ""),
          ...(form.pph22 ? [jl(ACC.pph22Prepaid, form.pph22, 0, "PPh 22 impor", form.ntpn)] : []),
          ...(form.importVat ? [jl(ACC.vatIn, form.importVat, 0, "PPN impor", form.ntpn)] : []),
          jl(form.payableAccount, 0, payable, `${form.currency} ${form.invoiceAmount.toLocaleString("id-ID")} × ${form.rate}`),
          ...(totalTax ? [jl(bank, 0, totalTax, "Pajak impor", form.ntpn)] : []),
          // Customs value above the invoice (freight/insurance) is owed elsewhere; below it, a credit.
          ...(difference ? [jl(form.differenceAccount, difference < 0 ? -difference : 0, difference > 0 ? difference : 0, "Selisih nilai pabean")] : []),
        ],
      },
      async () => number,
      { document: { type: "importPurchase", id, number } }
    )

    await w.set(IMPORT_PURCHASES, id, { ...form, number, customsValueRp, totalTax, journalId: journal.id } satisfies Omit<ImportPurchase, "id">)
    return number
  })
}

/** Posts a payment: journal payable (debit) / bank (credit) with a BBK number; invoices' remaining go down. */
async function postPayment(w: Writer, id: string, payment: Omit<SupplierPayment, "id">) {
  await ensureAccountingOpen(w, payment.date)
  const invoices = await Promise.all(payment.allocations.map((a) => w.get<PurchaseInvoice>(PURCHASE_INVOICES, a.invoice)))
  const number = await bankNumber(w, payment.bank, "BBK", payment.date)
  const byAccount = new Map<string, number>()

  for (const [i, a] of payment.allocations.entries()) {
    const invoice = invoices[i]
    if (!invoice) throw new Error(`Faktur ${a.number} tidak ditemukan.`)
    if (invoice.matchStatus === "pending") throw new Error(`${a.number}: selisih timbangan menunggu persetujuan Admin.`)
    if (a.amount <= 0) throw new Error(`Jumlah untuk ${a.number} harus lebih dari 0.`)
    if (a.amount > invoice.remaining + 0.005) throw new Error(`${a.number}: sisa hanya ${invoice.remaining.toLocaleString("id-ID")}.`)
    const paid = round2(invoice.paid + a.amount)
    await w.update(PURCHASE_INVOICES, a.invoice, {
      payments: [...invoice.payments, { date: payment.date, amount: a.amount, paymentId: id, number }],
      paid,
      remaining: round2(invoice.payable - paid),
      status: statusOf(invoice.payable, paid),
    })
    byAccount.set(invoice.payableAccount, round2((byAccount.get(invoice.payableAccount) ?? 0) + a.amount))
  }

  const text = `Pembayaran ${payment.allocations.map((a) => a.number).join(", ")}`
  const journal = await post(
    w,
    {
      date: payment.date,
      source: payment.bank,
      counterparty: payment.supplierName,
      description: text,
      lines: [...[...byAccount].map(([account, amount]) => jl(account, amount, 0, text)), jl(bankOf(payment.bank).account, 0, payment.total, text)],
    },
    async () => number,
    { document: { type: "supplierPayment", id, number } }
  )
  return { number, journalId: journal.id }
}

export type PaymentInput = Pick<SupplierPayment, "supplier" | "supplierName" | "date" | "bank" | "allocations">

/** Saves a payment; above the approval limit (and not by an Admin) it waits for approval. */
export function savePayment(form: PaymentInput, isAdmin: boolean) {
  return transaction(async (w) => {
    const allocations = form.allocations.filter((a) => a.amount > 0).map((a) => ({ ...a, amount: round2(a.amount) }))
    if (!allocations.length) throw new Error("Pilih minimal satu faktur dan isi jumlahnya.")
    const total = round2(allocations.reduce((s, a) => s + a.amount, 0))
    const pending = total > PAYMENT_APPROVAL_LIMIT && !isAdmin
    const id = w.newId(SUPPLIER_PAYMENTS)
    const payment: Omit<SupplierPayment, "id"> = {
      ...form,
      allocations,
      total,
      status: pending ? "pending" : "posted",
      number: "",
      journalId: "",
      requestedBy: me(),
      approvedBy: total > PAYMENT_APPROVAL_LIMIT && isAdmin ? me() : null,
      rejectReason: "",
    }
    if (!pending) Object.assign(payment, await postPayment(w, id, payment))
    await w.set(SUPPLIER_PAYMENTS, id, { ...payment, createdAt: serverTimestamp() })
    return payment
  })
}

/** Admin only (firestore.rules): posts a waiting payment. */
export function approvePayment(id: string) {
  return transaction(async (w) => {
    const payment = await w.get<Omit<SupplierPayment, "id">>(SUPPLIER_PAYMENTS, id)
    if (payment?.status !== "pending") throw new Error("Pembayaran ini tidak sedang menunggu persetujuan.")
    const posted = await postPayment(w, id, payment)
    await w.update(SUPPLIER_PAYMENTS, id, { ...posted, status: "posted", approvedBy: me() })
  })
}

export function rejectPayment(id: string, reason: string) {
  return transaction(async (w) => {
    const payment = await w.get<Omit<SupplierPayment, "id">>(SUPPLIER_PAYMENTS, id)
    if (payment?.status !== "pending") throw new Error("Pembayaran ini tidak sedang menunggu persetujuan.")
    await w.update(SUPPLIER_PAYMENTS, id, { status: "rejected", approvedBy: me(), rejectReason: reason })
  })
}

/** Records that an invoice's withheld PPh was paid (date + proof / NTPN). */
export function markWithholdingPaid(id: string, date: string, proof: string) {
  return transaction((w) => w.update(PURCHASE_INVOICES, id, { whtPaid: { date, proof } }))
}

/** Kg difference as a share of the weighed kg (0 when nothing weighed). */
export const matchDifference = (invoicedKg: number, weighedKg: number) => (weighedKg ? (invoicedKg - weighedKg) / weighedKg : 0)

/**
 * Links weighings to an invoice (same supplier, not yet invoiced) and compares kg:
 * a difference above the tolerance needs Admin approval before the invoice can be paid.
 */
async function matchWeighings(w: Writer, invoiceId: string, supplier: string, ids: string[], lines: PurchaseLine[]) {
  if (!ids.length) return { weighings: [], invoicedKg: 0, weighedKg: 0, matchStatus: "none" as const }
  const weighings = await Promise.all(ids.map((id) => w.get<Weighing>(WEIGHINGS, id)))
  const items = new Set<string>()
  for (const [i, wg] of weighings.entries()) {
    if (!wg || wg.status !== "stocked") throw new Error(`Timbangan ${ids[i]} tidak ditemukan atau belum selesai.`)
    if (wg.supplier !== supplier) throw new Error(`${wg.number} dari pemasok lain.`)
    if (wg.invoiceId) throw new Error(`${wg.number} sudah dicocokkan dengan faktur lain.`)
    for (const item of (await w.get<MaterialMap>(MATERIAL_MAPS, wg.material))?.items ?? []) items.add(item)
  }
  const invoicedKg = round2(lines.filter((l) => items.has(l.item)).reduce((s, l) => s + l.qty, 0))
  const weighedKg = round2(weighings.reduce((s, wg) => s + (wg!.net ?? 0), 0))
  for (const id of ids) await w.update(WEIGHINGS, id, { invoiceId })
  const ok = Math.abs(matchDifference(invoicedKg, weighedKg)) <= MATCH_TOLERANCE
  return { weighings: ids, invoicedKg, weighedKg, matchStatus: ok ? ("ok" as const) : ("pending" as const) }
}

/** Admin approves a weighing difference so the invoice can be paid. */
export function approveMatch(id: string) {
  return transaction((w) => w.update(PURCHASE_INVOICES, id, { matchStatus: "approved", matchApprovedBy: me() }))
}
