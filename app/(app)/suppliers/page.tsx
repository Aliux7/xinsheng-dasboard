"use client"

import { MasterPage } from "@/components/master-page"
import { NumberInput } from "@/components/number-input"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { SUPPLIERS, type Supplier } from "@/lib/collections"

const emptySupplier = { code: "", name: "", phone: "", address: "", taxNumber: "", paymentDays: 30, active: true }

export default function SuppliersPage() {
  return (
    <MasterPage<Supplier>
      path={SUPPLIERS}
      noun="pemasok"
      empty={emptySupplier}
      codePlaceholder="SP0001"
      searchText={(s) => [s.name]}
      columns={[
        { header: "Nama", cell: (s) => s.name },
        { header: "Telepon", cell: (s) => s.phone || "—", className: "hidden md:table-cell" },
      ]}
      fields={(form, set) => (
        <>
          <Field>
            <FieldLabel htmlFor="name">Nama</FieldLabel>
            <Input id="name" value={form.name} onChange={(e) => set({ name: e.target.value })} required />
          </Field>
          <Field>
            <FieldLabel htmlFor="phone">Telepon</FieldLabel>
            <Input id="phone" type="tel" value={form.phone} onChange={(e) => set({ phone: e.target.value })} required />
          </Field>
          <Field>
            <FieldLabel htmlFor="address">Alamat</FieldLabel>
            <Textarea id="address" value={form.address} onChange={(e) => set({ address: e.target.value })} required />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel htmlFor="taxNumber">NPWP</FieldLabel>
              <Input id="taxNumber" value={form.taxNumber} onChange={(e) => set({ taxNumber: e.target.value })} />
            </Field>
            <Field>
              <FieldLabel htmlFor="paymentDays">Termin pembayaran (hari)</FieldLabel>
              <NumberInput id="paymentDays" value={form.paymentDays ?? null} onChange={(paymentDays) => set({ paymentDays })} step={1} />
            </Field>
          </div>
        </>
      )}
      // Laporan_Bahan_Baku-*.xlsx
      importers={[{
        sheet: "SUPPLIER",
        fromRow: 2,
        toRow: 8,
        columns: [
          { col: "A", header: "Kode", required: true, example: "SP0001" },
          { col: "B", header: "Nama", required: true, example: "PT CONTOH JAYA" },
        ],
        parse: ([code = "", name = ""]) => (name ? { code, data: { name } } : "Nama kosong."),
        defaults: emptySupplier,
        newNote: "telepon dan alamat diisi nanti",
      }]}
    />
  )
}
