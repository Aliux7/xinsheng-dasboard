"use client"

import { MasterPage } from "@/components/master-page"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { statementOf } from "@/lib/accounting"
import { REPORT_LINES, type ReportLine } from "@/lib/collections"

export default function ReportLinesPage() {
  return (
    <MasterPage<ReportLine>
      path={REPORT_LINES}
      noun="baris laporan"
      empty={{ code: "", name: "", prefixes: "", active: true }}
      codePlaceholder="NR01"
      validateCode={(code) => (/^(NR|LR)/.test(code) ? null : "Awali dengan NR (neraca) atau LR (laba rugi).")}
      searchText={(l) => [l.name, l.prefixes]}
      columns={[
        { header: "Nama", cell: (l) => (l.name === l.code ? <span className="text-muted-foreground">Belum diberi nama</span> : l.name) },
        { header: "Laporan", cell: (l) => statementOf(l.code) },
        { header: "Nomor akun berawalan", cell: (l) => l.prefixes || "—", className: "hidden md:table-cell" },
      ]}
      fields={(form, set) => (
        <>
          <Field>
            <FieldLabel htmlFor="name">Nama</FieldLabel>
            <Input id="name" value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="Kas & bank" required />
          </Field>
          <Field>
            <FieldLabel htmlFor="prefixes">Nomor akun berawalan</FieldLabel>
            <Input id="prefixes" value={form.prefixes} onChange={(e) => set({ prefixes: e.target.value })} placeholder="5 atau 61, 62" />
            <FieldDescription>
              Akun yang diimpor tanpa baris laporan masuk ke sini bila nomornya berawalan salah satu dari ini. Yang
              paling panjang menang, jadi 61 mengalahkan 6.
            </FieldDescription>
          </Field>
        </>
      )}
      importers={[
        {
          title: "Impor baris laporan",
          description: "Tambah atau perbarui baris neraca (NR..) dan laba rugi (LR..); kode yang sudah ada diperbarui, sel kosong tidak menghapus isi.",
          sheet: "BARIS LAPORAN",
          fromRow: 2,
          columns: [
            { col: "A", header: "Kode", required: true, example: "NR01" },
            { col: "B", header: "Nama", required: true, example: "Kas & bank" },
            { col: "C", header: "Nomor akun berawalan", example: "11" },
          ],
          note: "Kode diawali NR (neraca) atau LR (laba rugi). Beberapa awalan nomor akun dipisah koma, mis. 61, 62.",
          parse: ([code = "", name = "", prefixes = ""], current) => {
            if (!/^(NR|LR)/i.test(code)) return code ? `"${code}" harus diawali NR atau LR.` : "Kode kosong."
            if (!current && !name) return "Nama kosong."
            return { code: code.toUpperCase(), data: { ...(name && { name }), ...(prefixes && { prefixes }) } }
          },
          defaults: { code: "", name: "", prefixes: "", active: true },
        },
      ]}
    />
  )
}
