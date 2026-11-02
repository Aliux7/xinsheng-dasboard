"use client"

import { MasterPage } from "@/components/master-page"
import { NumberInput } from "@/components/number-input"
import { Field, FieldDescription, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { CUSTOMERS, type Customer } from "@/lib/collections"

// No Excel import: the AR sheet in the financial statement file has headers only.
const empty: Omit<Customer, "id"> = {
  code: "",
  name: "",
  address: "",
  city: "",
  taxNumber: "",
  contact: "",
  phone: "",
  paymentDays: 30,
  creditLimit: null,
  recipientName: "",
  recipientAddress: "",
  recipientPhone: "",
  areaZh: "",
  active: true,
}

export default function CustomersPage() {
  return (
    <MasterPage<Customer>
      path={CUSTOMERS}
      noun="pelanggan"
      empty={empty}
      autoCode="CUS"
      searchText={(c) => [c.name, c.city, c.taxNumber, c.contact, c.phone]}
      columns={[
        { header: "Nama", cell: (c) => <span className="whitespace-normal">{c.name}</span> },
        { header: "Kota", cell: (c) => c.city || "—" },
        { header: "NPWP", cell: (c) => c.taxNumber || "—", className: "hidden md:table-cell" },
        { header: "Termin", cell: (c) => (c.paymentDays == null ? "—" : `${c.paymentDays} hari`), className: "hidden md:table-cell" },
        // Filled in by Phase 6 (invoices & payments).
        { header: "Saldo terbuka", cell: () => "", className: "hidden lg:table-cell" },
      ]}
      fields={(form, set) => (
        <>
          <Field>
            <FieldLabel htmlFor="name">Nama</FieldLabel>
            <Input id="name" value={form.name} onChange={(e) => set({ name: e.target.value })} required />
          </Field>
          <Field>
            <FieldLabel htmlFor="address">Alamat</FieldLabel>
            <Textarea id="address" value={form.address} onChange={(e) => set({ address: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel htmlFor="city">Kota</FieldLabel>
              <Input id="city" value={form.city} onChange={(e) => set({ city: e.target.value })} />
            </Field>
            <Field>
              <FieldLabel htmlFor="taxNumber">NPWP</FieldLabel>
              <Input id="taxNumber" value={form.taxNumber} onChange={(e) => set({ taxNumber: e.target.value })} />
            </Field>
            <Field>
              <FieldLabel htmlFor="contact">Kontak</FieldLabel>
              <Input id="contact" value={form.contact} onChange={(e) => set({ contact: e.target.value })} />
            </Field>
            <Field>
              <FieldLabel htmlFor="phone">Telepon</FieldLabel>
              <Input id="phone" type="tel" value={form.phone} onChange={(e) => set({ phone: e.target.value })} />
            </Field>
            <Field>
              <FieldLabel htmlFor="paymentDays">Termin pembayaran (hari)</FieldLabel>
              <NumberInput id="paymentDays" value={form.paymentDays} onChange={(paymentDays) => set({ paymentDays })} step={1} required />
            </Field>
            <Field>
              <FieldLabel htmlFor="creditLimit">Batas kredit (Rp)</FieldLabel>
              <NumberInput id="creditLimit" value={form.creditLimit} onChange={(creditLimit) => set({ creditLimit })} step={1} />
            </Field>
          </div>
          <FieldSet>
            <FieldLegend variant="label">Pengiriman (default surat jalan)</FieldLegend>
            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="recipientName">Nama penerima</FieldLabel>
                <Input id="recipientName" value={form.recipientName ?? ""} onChange={(e) => set({ recipientName: e.target.value })} />
              </Field>
              <Field>
                <FieldLabel htmlFor="recipientPhone">Telp. penerima</FieldLabel>
                <Input id="recipientPhone" type="tel" value={form.recipientPhone ?? ""} onChange={(e) => set({ recipientPhone: e.target.value })} />
              </Field>
              <Field className="col-span-2">
                <FieldLabel htmlFor="recipientAddress">Alamat penerima</FieldLabel>
                <Input id="recipientAddress" value={form.recipientAddress ?? ""} onChange={(e) => set({ recipientAddress: e.target.value })} />
              </Field>
              <Field>
                <FieldLabel htmlFor="areaZh">Area (Mandarin)</FieldLabel>
                <Input id="areaZh" value={form.areaZh ?? ""} onChange={(e) => set({ areaZh: e.target.value })} placeholder="泗水 SBY" />
              </Field>
            </div>
            <FieldDescription>Kosongkan untuk memakai alamat dan telepon pelanggan. Area Mandarin dicetak di ringkasan surat jalan (地址).</FieldDescription>
          </FieldSet>
        </>
      )}
    />
  )
}
