import { serverTimestamp } from "firebase/firestore"
import { readSheet } from "read-excel-file/browser"

import {
  PURCHASE_ACCOUNTS as ACC,
  PURCHASE_INVOICES,
  type InvoiceStatus,
  type Journal,
  type PurchaseInvoice,
  type Supplier,
  type Withholding,
} from "@/lib/collections"
import { transaction } from "@/lib/db"
import type { TemplateSheet } from "@/lib/excel-template"
import { auth } from "@/lib/firebase"
import { round2 } from "@/lib/journal"
import { addDays, statusOf } from "@/lib/purchase"

/**
 * 2025 purchase invoices, built from the imported "Purchase Invoice" journal entries that
 * credit trade payable (no new journals). Later entries crediting the same payable for the
 * same partner (e.g. year-end forex) are added to that invoice; imported bank entries that
 * debit trade payable become its payments. AP-sheet rows add detail or are listed for review.
 */
export const AP_IMPORT_DOC = { path: "imports", id: "purchase-invoices-2025" }
const PAYABLE = [ACC.payableIdr, ACC.payableUsd] as string[]

/** The columns `readApSheet` reads from sheet AP (detail for the invoices built from the journal). */
export const AP_TEMPLATE: TemplateSheet[] = [
  {
    name: "AP",
    headerRow: 3,
    lastRow: 6,
    note: "Faktur dibuat dari jurnal 2025 yang sudah diimpor; sheet ini hanya menambah keterangan, dicocokkan lewat No. voucher.",
    columns: [
      { col: "B", header: "No. voucher", required: true, example: "AP-0001" },
      { col: "C", header: "Pemasok", example: "PT CONTOH JAYA" },
      { col: "D", header: "Keterangan", example: "Pembelian biji plastik" },
      { col: "I", header: "Tanggal", example: "2025-10-15" },
      { col: "J", header: "DPP", example: "100000000" },
      { col: "N", header: "Hutang", example: "111000000" },
      { col: "P", header: "Status", example: "Open" },
    ],
  },
]

type Cell = string | number | boolean | Date | null
export type ApRow = { row: number; voucher: string; supplier: string; description: string; date: string; dpp: number; payable: number; status: string }
export type ApPlan = {
  invoices: (Omit<PurchaseInvoice, "id"> & { docId: string })[]
  /** AP-sheet rows with no matching purchase journal entry. */
  review: (ApRow & { reason: string })[]
  ledger: number
  open: number
}

const text = (c: Cell) => (c == null ? "" : c instanceof Date ? c.toISOString() : String(c).trim())
const num = (c: Cell) => (typeof c === "number" ? c : Number(text(c)) || 0)

export async function readApSheet(file: File): Promise<ApRow[]> {
  const rows = (await readSheet(file, "AP")) as Cell[][]
  // B voucher, C supplier, D description, I date, J DPP, N payable, P status (rows 4–6)
  return rows.slice(3, 6).map((c, i) => ({
    row: i + 4,
    voucher: text(c[1]),
    supplier: text(c[2]),
    description: text(c[3]),
    date: c[8] instanceof Date ? c[8].toISOString().slice(0, 10) : text(c[8]).slice(0, 10),
    dpp: num(c[9]),
    payable: num(c[13]),
    status: text(c[15]),
  }))
}

export function buildApPlan(journals: Journal[], apRows: ApRow[], suppliers: Supplier[]): ApPlan {
  const credits = (j: Journal) => round2(j.lines.filter((l) => PAYABLE.includes(l.account)).reduce((s, l) => s + l.credit - l.debit, 0))
  const purchase = journals.filter((j) => j.imported && j.source === "purchase" && credits(j) > 0).sort((a, b) => a.date.localeCompare(b.date))
  const invoiceEntries = purchase.filter((j) => j.number.startsWith("AP-"))
  const adjustments = purchase.filter((j) => !j.number.startsWith("AP-"))
  // Bank entries paying trade payable, oldest first, applied to the partner's invoices in date order.
  const payments = journals
    .filter((j) => j.imported && j.source !== "purchase")
    .flatMap((j) => j.lines.filter((l) => PAYABLE.includes(l.account) && l.debit).map((l) => ({ j, amount: l.debit })))
    .sort((a, b) => a.j.date.localeCompare(b.j.date))

  const invoices = invoiceEntries.map((j) => {
    const sheet = apRows.find((r) => r.voucher === j.number)
    const payableLine = j.lines.find((l) => PAYABLE.includes(l.account) && l.credit)!
    const extra = round2(adjustments.filter((a) => a.counterparty === j.counterparty).reduce((s, a) => s + credits(a), 0))
    const ppn = round2(j.lines.filter((l) => l.account === ACC.vatIn).reduce((s, l) => s + l.debit, 0))
    const pphLine = j.lines.find((l) => [ACC.pph23Payable, ACC.pph42Payable].includes(l.account as never) && l.credit)
    const goods = j.lines.filter((l) => l.debit && l.account !== ACC.vatIn)
    const dpp = round2(goods.reduce((s, l) => s + l.debit, 0))
    const withholding: Withholding = pphLine ? (pphLine.account === ACC.pph23Payable ? "pph23" : "pph42") : "none"
    return {
      docId: `imp-ap-${j.id}`,
      number: j.number,
      supplier: suppliers.find((s) => s.name.toUpperCase() === j.counterparty.toUpperCase())?.code ?? "",
      supplierName: j.counterparty,
      supplierInvoiceNo: "",
      date: j.date,
      taxInvoiceNo: "",
      taxInvoiceDate: "",
      dueDate: addDays(j.date, 30),
      lines: goods.map((l) => ({ item: "", description: l.description || sheet?.description || "", account: l.account, qty: 1, unit: "", price: l.debit, amount: l.debit })),
      vatPct: dpp ? round2((ppn / dpp) * 100) : 0,
      withholding,
      whtPct: pphLine && dpp ? round2((pphLine.credit / dpp) * 100) : 0,
      dpp,
      ppn,
      pph: pphLine?.credit ?? 0,
      payable: round2(credits(j) + extra),
      payableAccount: payableLine.account,
      payments: [] as PurchaseInvoice["payments"],
      paid: 0,
      remaining: 0,
      status: "open" as InvoiceStatus,
      journalId: j.id,
      imported: true,
    }
  })

  for (const p of payments) {
    let left = p.amount
    const theirs = invoices.filter((i) => i.supplierName === p.j.counterparty && i.date <= p.j.date)
    for (const [k, inv] of theirs.entries()) {
      const owed = round2(inv.payable - inv.paid)
      const take = k === theirs.length - 1 ? left : Math.min(left, owed) // the last invoice absorbs rounding (e.g. Rp 0,40)
      if (take <= 0) continue
      inv.payments.push({ date: p.j.date, amount: round2(take), paymentId: p.j.id, number: p.j.number })
      inv.paid = round2(inv.paid + take)
      left = round2(left - take)
      if (left <= 0) break
    }
  }
  for (const inv of invoices) {
    inv.remaining = round2(inv.payable - inv.paid)
    inv.status = statusOf(inv.payable, inv.paid)
  }

  const ledger = round2(journals.flatMap((j) => j.lines).filter((l) => PAYABLE.includes(l.account)).reduce((s, l) => s + l.credit - l.debit, 0))
  return {
    invoices,
    review: apRows
      .filter((r) => !invoiceEntries.some((j) => j.number === r.voucher))
      .map((r) => ({ ...r, reason: r.dpp ? "Tidak ada jurnal Purchase Invoice; dibayar langsung lewat bank." : "Tanpa DPP (pemotongan PPh terpisah)." })),
    ledger,
    open: round2(invoices.reduce((s, i) => s + i.remaining, 0)),
  }
}

export async function runApImport(plan: ApPlan) {
  const by = { uid: auth.currentUser!.uid, email: auth.currentUser!.email }
  await transaction(async (w) => {
    const marker = await w.get<{ status: string }>(AP_IMPORT_DOC.path, AP_IMPORT_DOC.id)
    if (marker?.status === "done") throw new Error("Impor faktur pembelian 2025 sudah pernah dijalankan.")
    for (const { docId, ...invoice } of plan.invoices) if (!(await w.get(PURCHASE_INVOICES, docId))) await w.set(PURCHASE_INVOICES, docId, invoice)
    await w.set(AP_IMPORT_DOC.path, AP_IMPORT_DOC.id, {
      status: "done",
      by,
      finishedAt: serverTimestamp(),
      summary: { invoices: plan.invoices.length, open: plan.open, ledger: plan.ledger, review: plan.review.map((r) => r.voucher) },
    })
  })
}
