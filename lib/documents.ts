import { PAYMENT_METHODS, type CompanySettings, type Customer, type Delivery, type Product, type SalesInvoice } from "@/lib/collections"
import { lineWeights, printName, printNameZh, withoutChinese } from "@/lib/deliveries"
import { gap, row, sideBySide, type PrintCell, type PrintLayout, type PrintRow } from "@/lib/print-layout"
import { formatDay, formatNumber } from "@/lib/utils"

/**
 * Printed delivery note (sheet SJ-IND) and sales invoice (sheet FAKTUR) of the client's
 * STOCK TERPAL workbook. Parts with no data (e.g. no container, no scale weight) are left out.
 */

const ONES = ["", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan", "sepuluh", "sebelas"]

function words(n: number): string {
  if (n < 12) return ONES[n]
  if (n < 20) return `${words(n - 10)} belas`
  if (n < 100) return `${words(Math.floor(n / 10))} puluh ${words(n % 10)}`
  if (n < 200) return `seratus ${words(n - 100)}`
  if (n < 1000) return `${words(Math.floor(n / 100))} ratus ${words(n % 100)}`
  if (n < 2000) return `seribu ${words(n - 1000)}`
  for (const [size, name] of [[1e12, "triliun"], [1e9, "miliar"], [1e6, "juta"], [1e3, "ribu"]] as const) {
    if (n >= size) return `${words(Math.floor(n / size))} ${name} ${words(n % size)}`
  }
  return ""
}

/** Amount in Indonesian words, whole Rupiah: 130000 → "Seratus Tiga Puluh Ribu Rupiah". */
export function amountInWords(amount: number) {
  const n = Math.round(Math.abs(amount))
  const text = `${amount < 0 ? "minus " : ""}${n ? words(n) : "nol"} rupiah`
  return text.replace(/\s+/g, " ").trim().replace(/(^|\s)\S/g, (c) => c.toUpperCase())
}

/** Company letterhead across `width` columns, unless there is none or it is switched off (pre-printed paper). */
export function letterheadText(company: CompanySettings | null) {
  if (!company?.name || company.noLetterhead) return null
  const contact = [company.phone && `Telp. ${company.phone}`, company.email, company.taxNumber && `NPWP ${company.taxNumber}`].filter(Boolean).join(" · ")
  return { name: company.name, address: company.address, contact }
}

function letterhead(settings: CompanySettings | null, width: number): PrintRow[] {
  const company = letterheadText(settings)
  if (!company) return []
  const { contact } = company
  return [
    row(width, [{ value: company.name, span: width, bold: true, size: 14 }]),
    ...(company.address ? [row(width, [{ value: company.address, span: width, size: 9, wrap: true }])] : []),
    ...(contact ? [row(width, [{ value: contact, span: width, size: 9 }])] : []),
    row(width, [{ span: width, border: "under" }], 6),
    gap(width, 8),
  ]
}

const upper = (unit: string) => unit.toUpperCase()

/** File name for a downloaded document, e.g. "Surat_jalan_DO-251120009.xlsx". */
export const documentFile = (kind: string, number: string) => `${kind}_${number}.xlsx`.replace(/[^\w.-]+/g, "_")

/** Signature line under Penerima / Hormat kami (delivery note) and Hormat Kami (invoice). */
export const SIGNATURE_LINE = "( ________________ )"
/** For the narrow Pengantar column of the delivery note, when no driver is entered. */
export const SHORT_SIGNATURE_LINE = "( ___________ )"

/** The JUMLAH | NAMA BARANG table always has at least this many rows, so the signatures stay in place. */
export const DELIVERY_ROWS = 18

/** Chinese font for the Chinese summary in Excel. */
const CHINESE_FONT = "Microsoft YaHei"

/** Everything printed on a delivery note (SJ-IND), shared by the print page and the Excel export. */
export type DeliveryContent = {
  date: string
  number: string
  customerName: string
  destination: string
  /** Recipient name and address lines (only those filled in). */
  recipient: string[]
  phone: string
  plate: string
  container: string
  driver: string
  driverPhone: string
  /** Customer's area in Chinese (地址), may be "". */
  area: string
  lines: {
    qty: number
    unit: string
    /** "TERPAL A2B 4X50m SKYBLUE / SILVER (16 Kg)" */
    name: string
    /** "灰布 A2B 4X50m 天蓝银 SBS 16 Kg = 1支" */
    nameZh: string
    sticker: string
    net: number
    gross: number
    scale: number | null
    average: number | null
    over: number | null
    overPct: number | null
  }[]
  /** Optional columns of the Chinese table. */
  stickers: boolean
  weighed: boolean
  totals: { qty: number; net: number; gross: number; scale: number | null; average: number | null; over: number | null; overPct: number | null }
}

/** Product names come from the product (so they follow its current colour split), else what the note saved. */
export function deliveryContent(d: Delivery, customer: Customer | undefined, products: Product[]): DeliveryContent {
  const weighed = d.totalScale != null
  return {
    date: formatDay(d.date),
    number: d.number,
    customerName: d.customerName,
    destination: d.destination,
    recipient: [d.recipientName, d.recipientAddress].filter(Boolean),
    phone: d.recipientPhone,
    plate: d.plate,
    container: d.container,
    driver: d.driver,
    driverPhone: d.driverPhone,
    area: customer?.areaZh ?? "",
    lines: d.lines.map((l) => {
      const p = products.find((x) => x.code === l.product)
      const w = lineWeights(l, l.rollNetKg, l.rollGrossKg)
      return {
        qty: l.qty,
        unit: upper(l.unit),
        name: withoutChinese(p ? printName(p) : l.description),
        nameZh: `${p ? printNameZh(p) : l.descriptionZh} = ${formatNumber(l.qty)}支`,
        sticker: l.sticker,
        net: l.netKg,
        gross: l.grossKg,
        scale: l.scaleKg,
        average: w.averageKg,
        over: w.overKg,
        overPct: w.overPct,
      }
    }),
    stickers: d.lines.some((l) => l.sticker),
    weighed,
    totals: {
      qty: d.totalQty,
      net: d.totalNet,
      gross: d.totalGross,
      scale: d.totalScale,
      average: weighed && d.totalQty ? Math.round(((d.totalScale ?? 0) / d.totalQty) * 100) / 100 : null,
      over: d.overweight,
      overPct: weighed && d.totalNet ? (d.overweight ?? 0) / d.totalNet : null,
    },
  }
}

// Delivery note: Indonesian part A–F as in SJ-IND, Chinese summary on the right (columns J–S there).
export const LEFT = [10, 6, 14, 14, 10, 18]
const L = LEFT.length

export function deliveryLayout(d: Delivery, company: CompanySettings | null, customer: Customer | undefined, products: Product[]): PrintLayout {
  const c = deliveryContent(d, customer, products)
  const box = (value: PrintCell["value"], more: PrintCell = {}): PrintCell => ({ value, border: "box", align: "center", ...more })
  const blank = Math.max(0, DELIVERY_ROWS - c.lines.length)
  const left: PrintRow[] = [
    row(L, [{ span: 4 }, box("TGL.", { bold: true }), box(c.date)]),
    row(L, [{ span: 4 }, box("KEPADA YTH.", { span: 2 })]),
    row(L, [{ span: 4 }, box(c.customerName, { span: 2, bold: true, size: 11, wrap: true })]),
    gap(L),
    row(L, [{ value: "DIKIRIM KE :", span: 2, size: 10 }, { value: c.destination, span: 4, size: 10, bold: true }]),
    ...c.recipient.map((text) => row(L, [{ span: 2 }, { value: text, span: 4, wrap: true }])),
    ...(c.phone ? [row(L, [{ value: "NO. TELP:", span: 2, size: 10 }, { value: c.phone, span: 4 }])] : []),
    gap(L),
    row(L, [{ value: "SURAT JALAN NO.", span: 2, bold: true }, { value: c.number, span: 2, bold: true, size: 11 }, { value: "NO.POL :", align: "right" }, { value: c.plate, align: "center", size: 10 }]),
    ...(c.container ? [row(L, [{ span: 4 }, { value: "NO. CONT :", align: "right" }, { value: c.container, align: "center", size: 10 }])] : []),
    row(L, [box("JUMLAH", { span: 2, bold: true }), box("NAMA BARANG", { span: 4, bold: true })]),
    ...c.lines.map((l) => row(L, [box(l.qty), box(l.unit), box(l.name, { span: 4, align: "left", wrap: true })])),
    // Empty rows up to 18, borders kept, so the signature row stays in the same place.
    ...Array.from({ length: blank }, () => row(L, [box(null), box(null), box(null, { span: 4 })])),
    gap(L, 10),
    row(L, [{ value: "Penerima", span: 3, align: "center" }, { value: "Pengantar", align: "center" }, { value: "Hormat kami,", span: 2, align: "center" }]),
    gap(L, 40),
    row(L, [{ value: SIGNATURE_LINE, span: 3, align: "center" }, { value: c.driver ? `( ${c.driver} )` : SHORT_SIGNATURE_LINE, align: "center" }, { value: SIGNATURE_LINE, span: 2, align: "center" }]),
    ...(c.driverPhone ? [row(L, [{ span: 3 }, { value: c.driverPhone, align: "center" }])] : []),
  ]

  // 产品备细 | 唛头 | 数量 | 净重 | 毛重 | 地磅重 | 平均 Kg | 超重 (kg, %); 唛头 and the scale columns only when used.
  const RIGHT = [8, c.weighed ? 26 : 40, ...(c.stickers ? [10] : []), 6, 8, 8, ...(c.weighed ? [8, 7, 6, 7] : [])]
  const R = RIGHT.length
  const zh = (cell: PrintCell): PrintCell => ({ font: CHINESE_FONT, ...cell })
  const head = (value: string) => zh({ value, bold: true, border: "box", align: "center" })
  const num = (value: number | null, more: PrintCell = {}) => zh({ value, border: "box", align: "right", ...more })
  const label = (text: string, value: string): PrintRow => row(R, [zh({ value: text }), zh({ value, span: R - 1 })])
  const t = c.totals
  const right: PrintRow[] = [
    label("日期:", c.date),
    label("单子:", c.number),
    label("客户:", c.customerName),
    ...(c.area ? [label("地址:", c.area)] : []),
    ...(c.driver ? [label("司机:", [c.driver, c.driverPhone].filter(Boolean).join(" - "))] : []),
    label("总数量:", `${formatNumber(t.qty)}  支`),
    label("总毛重:", `${formatNumber(t.gross)}  Kg`),
    ...(c.weighed ? [label("地磅重:", `${formatNumber(t.scale)}  Kg`)] : []),
    gap(R),
    row(R, [zh({ value: "产品备细 :", span: 2, bold: true, border: "box" }), ...(c.stickers ? [head("唛头")] : []), head("数量"), head("净重"), head("毛重"), ...(c.weighed ? [head("地磅重"), head("平均 Kg"), head("超重"), head("超重 %")] : [])]),
    ...c.lines.map((l, i) =>
      row(R, [
        zh({ value: `${i + 1}.`, align: "center", border: "box" }),
        zh({ value: l.nameZh, border: "box", wrap: true }),
        ...(c.stickers ? [zh({ value: l.sticker, border: "box", wrap: true })] : []),
        num(l.qty, { bold: true }),
        num(l.net),
        num(l.gross),
        ...(c.weighed ? [num(l.scale), num(l.average), num(l.over), num(l.overPct, { percent: true })] : []),
      ])
    ),
    row(R, [
      zh({ value: "总额", span: c.stickers ? 3 : 2, align: "right", bold: true, border: "box" }),
      num(t.qty, { bold: true }),
      num(t.net, { bold: true }),
      num(t.gross, { bold: true }),
      ...(c.weighed ? [num(t.scale, { bold: true }), num(t.average, { bold: true }), num(t.over, { bold: true }), num(t.overPct, { bold: true, percent: true })] : []),
    ]),
  ]

  const width = L + 1 + R
  return {
    sheet: "SJ",
    orientation: "landscape",
    columns: [...LEFT, 2, ...RIGHT],
    fontSize: 8,
    fit: "page",
    rows: [...letterhead(company, width), ...sideBySide(left, L, right, R)],
  }
}

/** Everything printed on an invoice (FAKTUR), shared by the print page and the Excel export. */
export type InvoiceContent = {
  date: string
  customerName: string
  city: string
  number: string
  /** "DO: DO-…, DO-…" when made from delivery notes (cell J7 in the Excel), else "". */
  deliveries: string
  lines: { qty: number; unit: string; name: string; price: number; amount: number }[]
  /** DPP and PPN rows only when PPN > 0. */
  tax: { dpp: number; label: string; ppn: number } | null
  total: number
  words: string
  /** PEMBAYARAN, then the receiving account's rows when there is one. */
  payment: [string, string][]
}

/**
 * Product lines read "TERPAL {type} {size} {colour} ({gross kg} Kg)" from the product, without
 * product code, colour code or Chinese text; free-text lines print as typed (without Chinese).
 */
export function invoiceContent(inv: SalesInvoice, customer: Customer | undefined, products: Product[]): InvoiceContent {
  const nameOf = (l: SalesInvoice["lines"][number]) => {
    const p = l.product ? products.find((x) => x.code === l.product) : undefined
    return withoutChinese(p ? printName(p) : l.description)
  }
  const account = inv.bankAccount
  return {
    date: formatDay(inv.date),
    customerName: inv.customerName,
    city: customer?.city ?? "",
    number: inv.number,
    deliveries: inv.deliveryNumbers?.length ? `DO: ${inv.deliveryNumbers.join(", ")}` : "",
    lines: inv.lines.map((l) => ({ qty: l.qty, unit: upper(l.unit), name: nameOf(l), price: l.price, amount: l.amount })),
    tax: inv.ppn > 0 ? { dpp: inv.dpp, label: `PPN ${formatNumber(inv.vatPct)}%`, ppn: inv.ppn } : null,
    total: inv.total,
    words: amountInWords(inv.total),
    payment: (
      [
        ["PEMBAYARAN", inv.paymentMethod ? PAYMENT_METHODS[inv.paymentMethod].toUpperCase() : ""],
        ["PENERIMA", account?.holder ?? ""],
        ["NO. REKENING", account?.accountNo ?? ""],
        ["NAMA BANK", account?.bank ?? ""],
        ["ALAMAT", account?.branch ?? ""],
      ] as [string, string][]
    ).filter(([, value]) => value),
  }
}

// Invoice: columns A–E of FAKTUR (widths in characters; the print page uses the same proportions).
export const INVOICE = [9, 7, 62, 16, 20]
const I = INVOICE.length

export function invoiceLayout(inv: SalesInvoice, company: CompanySettings | null, customer: Customer | undefined, products: Product[]): PrintLayout {
  const c = invoiceContent(inv, customer, products)
  const box = (value: PrintCell["value"], more: PrintCell = {}): PrintCell => ({ value, border: "box", align: "center", ...more })
  const rows: PrintRow[] = [
    ...letterhead(company, I),
    row(I, [{ span: 3 }, box("TANGGAL"), box(c.date)]),
    row(I, [{ span: 3 }, box("KEPADA YTH.", { span: 2 })]),
    row(I, [{ span: 3 }, box(c.customerName, { span: 2, bold: true, size: 12, wrap: true })]),
    ...(c.city ? [row(I, [{ span: 3 }, box(c.city, { span: 2, bold: true, size: 12 })])] : []),
    gap(I),
    row(I, [{ value: "FAKTUR NO :", span: 2, size: 11 }, { value: c.number, size: 13, bold: true }, { value: c.deliveries, span: 2, align: "right", wrap: true }]),
    gap(I),
    row(I, [box("BANYAKNYA", { span: 2, bold: true }), box("NAMA BARANG", { bold: true }), box("HARGA", { bold: true }), box("JUMLAH", { bold: true })]),
    ...c.lines.map((l) => row(I, [box(l.qty), box(l.unit), box(l.name, { align: "left", wrap: true }), box(l.price, { align: "right" }), box(l.amount, { align: "right" })])),
    ...(c.tax
      ? [row(I, [{ span: 3 }, box("DPP"), box(c.tax.dpp, { align: "right" })]), row(I, [{ span: 3 }, box(c.tax.label), box(c.tax.ppn, { align: "right" })])]
      : []),
    row(I, [box(c.words, { span: 3, size: 11, wrap: true }), box("TOTAL RP:", { bold: true }), box(c.total, { align: "right", bold: true, size: 12 })], 24),
    gap(I),
    // Signature under HARGA / JUMLAH: room for stamp and signature, then the name line.
    row(I, [{ span: 3 }, { value: "Hormat Kami,", span: 2, align: "center" }]),
    gap(I, 18),
    gap(I, 18),
    gap(I, 18),
    gap(I, 18),
    row(I, [{ span: 3 }, { value: SIGNATURE_LINE, span: 2, align: "center" }]),
    gap(I),
    ...c.payment.map(([name, value]) => row(I, [{ value: name, span: 2 }, { value: `: ${value}`, span: 3 }])),
  ]
  return { sheet: "FAKTUR", orientation: "portrait", columns: INVOICE, fontSize: 10, fit: "width", rows }
}
