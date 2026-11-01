import type { Account, Journal } from "@/lib/collections"
import { round2 } from "@/lib/journal"

/**
 * Balance sheet and P&L, laid out like the NERACA / LABARUGI sheets. Each line sums the
 * accounts whose report line (Daftar akun → Baris laporan) is one of its codes.
 */

export type LineDef = { label: string; codes: string[] }
export type SectionDef = { key: string; label: string; lines: LineDef[] }

const L = (label: string, ...codes: string[]): LineDef => ({ label, codes })

export const BALANCE_LAYOUT: SectionDef[] = [
  {
    key: "current",
    label: "Aset lancar",
    lines: [
      L("Kas & bank", "NR01"), L("Piutang usaha", "NR02"), L("Piutang lain-lain", "NR03"), L("Piutang karyawan", "NR04"),
      L("Uang muka pembelian", "NR05"), L("Persediaan", "NR06"), L("Deposit", "NR07"), L("Pajak dibayar dimuka", "NR08"),
      L("Biaya dibayar dimuka", "NR09"), L("Biaya praoperasi", "NR10"), L("Akun sementara", "NR11"),
    ],
  },
  {
    key: "fixed",
    label: "Aset tetap",
    lines: [
      L("Bangunan", "NR21"), L("Mesin", "NR22"), L("Peralatan utilitas", "NR23"), L("Kendaraan", "NR24"), L("Peralatan kantor", "NR25"),
      L("Perbaikan bangunan", "NR26"), L("Akumulasi penyusutan", "NR28"), L("Aset dalam penyelesaian", "NR34"),
    ],
  },
  {
    key: "liabilities",
    label: "Liabilitas jangka pendek",
    lines: [L("Hutang usaha", "NR51"), L("Uang muka penjualan", "NR52"), L("Hutang pajak", "NR53"), L("Biaya yang masih harus dibayar", "NR54"), L("Hutang lain-lain", "NR55")],
  },
  { key: "longterm", label: "Liabilitas jangka panjang", lines: [L("Pinjaman pemegang saham", "NR56"), L("Hutang leasing", "NR57")] },
  { key: "equity", label: "Ekuitas", lines: [L("Modal disetor", "NR61"), L("Selisih kurs belum direalisasi", "NR75")] },
]

export const PNL_LAYOUT: SectionDef[] = [
  { key: "revenue", label: "Pendapatan", lines: [L("Penjualan", "LR01", "LR02", "LR03", "LR04", "LR05")] },
  {
    key: "cost",
    label: "Biaya produksi & HPP",
    lines: [L("Upah langsung", "LR06"), L("Beban pabrikasi", "LR07"), L("Harga pokok penjualan", "LR08", "LR09", "LR10", "LR11")],
  },
  { key: "selling", label: "Beban penjualan", lines: [L("Biaya penjualan", "LR12"), L("Biaya angkut", "LR13")] },
  {
    key: "ga",
    label: "Beban administrasi & umum",
    lines: [
      L("Gaji & upah", "LR30"), L("Penyusutan", "LR31"), L("Pemeliharaan & kebersihan", "LR32"), L("Utilitas listrik, telepon, air", "LR33"),
      L("Perlengkapan kantor", "LR34"), L("Asuransi", "LR35"), L("Materai", "LR36"), L("BBM, parkir & perjalanan dinas", "LR38"),
      L("Rumah dinas", "LR39"), L("Perijinan", "LR41"), L("Profesional", "LR42"), L("Pelatihan karyawan", "LR43"), L("Sewa", "LR44"),
      L("Makan & minum karyawan", "LR45"), L("Pajak daerah & PBB", "LR46"), L("Rapat & kantor lainnya", "LR48"), L("Postage & kurir", "LR49"),
      L("Entertain", "LR50"), L("APD & berobat karyawan", "LR51"), L("Klaim & piutang tak tertagih", "LR52"), L("Uji coba produksi", "LR53"),
      L("Iklan", "LR55"), L("Donasi", "LR56"), L("Acara", "LR57"), L("Pajak", "LR58"),
    ],
  },
  {
    key: "other",
    label: "Pendapatan & beban lain-lain",
    lines: [L("Bunga bank", "LR70"), L("Pendapatan lain-lain", "LR71"), L("Biaya administrasi bank", "LR72"), L("Pajak bunga bank", "LR73"), L("Selisih kurs", "LR74")],
  },
]

const isPnl = (a?: Account, code?: string) =>
  a?.reportLine ? a.reportLine.toUpperCase().startsWith("LR") : a?.type ? ["revenue", "production", "expense", "otherIncome", "otherExpense"].includes(a.type) : Number((code ?? "0")[0]) >= 4

/** Net debit − credit per account for lines dated in [from, to). */
export function netByAccount(journals: Journal[], from: string, to: string) {
  const net = new Map<string, number>()
  for (const j of journals)
    for (const l of j.lines) {
      const d = l.date ?? j.date
      if (d >= from && d < to) net.set(l.account, round2((net.get(l.account) ?? 0) + l.debit - l.credit))
    }
  return net
}

export type StatementLine = { key: string; label: string; section: string; accounts: string[]; values: number[]; computed?: boolean }

const monthEnds = (year: number) => Array.from({ length: 12 }, (_, i) => (i === 11 ? `${year + 1}-01-01` : `${year}-${String(i + 2).padStart(2, "0")}-01`))
const monthStarts = (year: number) => Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}-01`)

function linesFor(layout: SectionDef[], accounts: Account[], pnl: boolean) {
  const byCode = (codes: string[]) => accounts.filter((a) => isPnl(a, a.code) === pnl && codes.includes((a.reportLine ?? "").toUpperCase())).map((a) => a.code)
  const mapped = new Set(layout.flatMap((s) => s.lines.flatMap((l) => byCode(l.codes))))
  const unmapped = () => accounts.filter((a) => isPnl(a, a.code) === pnl && !mapped.has(a.code)).map((a) => a.code)
  return { byCode, unmapped }
}

/** Balance sheet at each month-end of `year`. Asset lines are debit-positive, the rest credit-positive. */
export function balanceSheet(journals: Journal[], accounts: Account[], year: number) {
  const { byCode, unmapped } = linesFor(BALANCE_LAYOUT, accounts, false)
  const ends = monthEnds(year)
  const cumulative = ends.map((end) => netByAccount(journals, "0000", end))
  const value = (codes: string[], sign: number) => cumulative.map((net) => round2(sign * codes.reduce((s, c) => s + (net.get(c) ?? 0), 0)))
  const pnlAccounts = accounts.filter((a) => isPnl(a, a.code)).map((a) => a.code)
  const allPnl = [...new Set([...pnlAccounts, ...journals.flatMap((j) => j.accounts).filter((c) => isPnl(accounts.find((a) => a.code === c), c))])]
  const yearStart = `${year}-01-01`
  const before = netByAccount(journals, "0000", yearStart)

  const lines: StatementLine[] = []
  for (const section of BALANCE_LAYOUT) {
    const sign = section.key === "current" || section.key === "fixed" ? 1 : -1
    for (const l of section.lines) {
      const codes = byCode(l.codes)
      lines.push({ key: `${section.key}:${l.label}`, label: l.label, section: section.key, accounts: codes, values: value(codes, sign) })
    }
    if (section.key === "equity") {
      // Retained earnings: the retained-earnings accounts plus every earlier year's result.
      const retained = byCode(["NR62"])
      const priorResult = round2(-allPnl.reduce((s, c) => s + (before.get(c) ?? 0), 0))
      lines.push({ key: "equity:retained", label: "Laba ditahan", section: "equity", accounts: retained, values: value(retained, -1).map((v) => round2(v + priorResult)), computed: true })
      const current = byCode(["NR64"])
      lines.push({
        key: "equity:current",
        label: "Laba (rugi) tahun berjalan",
        section: "equity",
        accounts: current,
        values: ends.map((end, i) => round2(value(current, -1)[i] - allPnl.reduce((s, c) => s + (netByAccount(journals, yearStart, end).get(c) ?? 0), 0))),
        computed: true,
      })
    }
  }
  // Balance-sheet accounts without a report line, so nothing silently drops out.
  const loose = unmapped().filter((c) => !byCode(["NR62", "NR64"]).includes(c))
  lines.push({ key: "unmapped", label: "Tanpa baris laporan (debit − kredit)", section: "unmapped", accounts: loose, values: value(loose, 1) })
  return { lines, columns: ends.map((_, i) => monthStarts(year)[i].slice(0, 7)) }
}

/** P&L per month of `year`. Revenue and other income/expense are credit-positive; costs are debit-positive. */
export function profitAndLoss(journals: Journal[], accounts: Account[], year: number) {
  const { byCode, unmapped } = linesFor(PNL_LAYOUT, accounts, true)
  const starts = monthStarts(year)
  const ends = monthEnds(year)
  const monthly = starts.map((s, i) => netByAccount(journals, s, ends[i]))
  const value = (codes: string[], sign: number) => {
    const months = monthly.map((net) => round2(sign * codes.reduce((s, c) => s + (net.get(c) ?? 0), 0)))
    return [...months, round2(months.reduce((s, v) => s + v, 0))]
  }
  const lines: StatementLine[] = []
  for (const section of PNL_LAYOUT) {
    const sign = section.key === "revenue" || section.key === "other" ? -1 : 1
    for (const l of section.lines) {
      const codes = byCode(l.codes)
      lines.push({ key: `${section.key}:${l.label}`, label: l.label, section: section.key, accounts: codes, values: value(codes, sign) })
    }
  }
  const loose = [...new Set([...unmapped(), ...journals.flatMap((j) => j.accounts).filter((c) => isPnl(accounts.find((a) => a.code === c), c) && !accounts.some((a) => a.code === c))])]
  lines.push({ key: "unmapped", label: "Tanpa baris laporan (debit − kredit)", section: "unmapped", accounts: loose, values: value(loose, 1) })
  return { lines, columns: [...starts.map((s) => s.slice(0, 7)), "Total"] }
}

export const sectionTotal = (lines: StatementLine[], section: string, width: number) =>
  Array.from({ length: width }, (_, i) => round2(lines.filter((l) => l.section === section).reduce((s, l) => s + l.values[i], 0)))
