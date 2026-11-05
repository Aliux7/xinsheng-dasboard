import { addRecord, transaction, updateRecord } from "@/lib/db"

/**
 * Report lines (Baris laporan): `reportLines/{code}`, NR.. for the balance sheet (Neraca) and LR.. for
 * profit & loss (Laba rugi). An account's `reportLine` picks one (or none); a report line sums its accounts.
 * The code never changes; lines are deactivated, never deleted.
 */
export const REPORT_LINES = "reportLines"

export type ReportLine = { id: string; code: string; name: string; active: boolean }

export const REPORT_LINE_CODE = /^(NR|LR)\d{2,3}$/

export const statementOf = (code: string) => (code.startsWith("NR") ? "Neraca" : code.startsWith("LR") ? "Laba rugi" : "")

/** The lines of the client's NERACA / LABARUGI sheets, as used by the earlier version's statements. */
export const STANDARD_REPORT_LINES: [string, string][] = [
  ["NR01", "Kas & bank"], ["NR02", "Piutang usaha"], ["NR03", "Piutang lain-lain"], ["NR04", "Piutang karyawan"],
  ["NR05", "Uang muka pembelian"], ["NR06", "Persediaan"], ["NR07", "Deposit"], ["NR08", "Pajak dibayar dimuka"],
  ["NR09", "Biaya dibayar dimuka"], ["NR10", "Biaya praoperasi"], ["NR11", "Akun sementara"],
  ["NR21", "Bangunan"], ["NR22", "Mesin"], ["NR23", "Peralatan utilitas"], ["NR24", "Kendaraan"], ["NR25", "Peralatan kantor"],
  ["NR26", "Perbaikan bangunan"], ["NR28", "Akumulasi penyusutan"], ["NR34", "Aset dalam penyelesaian"],
  ["NR51", "Hutang usaha"], ["NR52", "Uang muka penjualan"], ["NR53", "Hutang pajak"], ["NR54", "Biaya yang masih harus dibayar"],
  ["NR55", "Hutang lain-lain"], ["NR56", "Pinjaman pemegang saham"], ["NR57", "Hutang leasing"],
  ["NR61", "Modal disetor"], ["NR62", "Laba ditahan"], ["NR64", "Laba (rugi) tahun berjalan"], ["NR75", "Selisih kurs belum direalisasi"],
  ["LR01", "Penjualan"], ["LR02", "Penjualan"], ["LR03", "Penjualan"], ["LR04", "Penjualan"], ["LR05", "Penjualan"],
  ["LR06", "Upah langsung"], ["LR07", "Beban pabrikasi"],
  ["LR08", "Harga pokok penjualan"], ["LR09", "Harga pokok penjualan"], ["LR10", "Harga pokok penjualan"], ["LR11", "Harga pokok penjualan"],
  ["LR12", "Biaya penjualan"], ["LR13", "Biaya angkut"],
  ["LR30", "Gaji & upah"], ["LR31", "Penyusutan"], ["LR32", "Pemeliharaan & kebersihan"], ["LR33", "Utilitas listrik, telepon, air"],
  ["LR34", "Perlengkapan kantor"], ["LR35", "Asuransi"], ["LR36", "Materai"], ["LR38", "BBM, parkir & perjalanan dinas"],
  ["LR39", "Rumah dinas"], ["LR41", "Perijinan"], ["LR42", "Profesional"], ["LR43", "Pelatihan karyawan"], ["LR44", "Sewa"],
  ["LR45", "Makan & minum karyawan"], ["LR46", "Pajak daerah & PBB"], ["LR48", "Rapat & kantor lainnya"], ["LR49", "Postage & kurir"],
  ["LR50", "Entertain"], ["LR51", "APD & berobat karyawan"], ["LR52", "Klaim & piutang tak tertagih"], ["LR53", "Uji coba produksi"],
  ["LR55", "Iklan"], ["LR56", "Donasi"], ["LR57", "Acara"], ["LR58", "Pajak"],
  ["LR70", "Bunga bank"], ["LR71", "Pendapatan lain-lain"], ["LR72", "Biaya administrasi bank"], ["LR73", "Pajak bunga bank"], ["LR74", "Selisih kurs"],
]

export type ReportLineInput = Omit<ReportLine, "id">

export function saveReportLine(input: ReportLineInput, isNew: boolean) {
  const code = input.code.trim().toUpperCase()
  if (!REPORT_LINE_CODE.test(code)) throw new Error("Kode diawali NR (Neraca) atau LR (Laba rugi) lalu 2–3 angka, mis. NR01.")
  const data = { ...input, code, name: input.name.trim() }
  return isNew ? addRecord(REPORT_LINES, data, code) : updateRecord(REPORT_LINES, code, data)
}

/** Adds the standard lines whose code doesn't exist yet; existing ones are left as they are. */
export function addStandardReportLines() {
  return transaction(async (w) => {
    let added = 0
    for (const [code, name] of STANDARD_REPORT_LINES) {
      if (await w.get(REPORT_LINES, code)) continue
      await w.set(REPORT_LINES, code, { code, name, active: true })
      added++
    }
    return added
  })
}
