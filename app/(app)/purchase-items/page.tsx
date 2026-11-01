"use client"

import { MasterPage } from "@/components/master-page"
import { SimpleSelect } from "@/components/simple-select"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useCollection } from "@/hooks/use-collection"
import {
  ACCOUNTS,
  DEFAULT_BOOKING_ACCOUNT,
  PURCHASE_ITEMS,
  type Account,
  type PurchaseItem,
} from "@/lib/collections"

const empty: Omit<PurchaseItem, "id"> = {
  code: "",
  name: "",
  group: "",
  groupCode: "",
  unit: "",
  remarks: "",
  account: DEFAULT_BOOKING_ACCOUNT,
  active: true,
}

export default function PurchaseItemsPage() {
  const accounts = useCollection<Account>(ACCOUNTS, { orderBy: "code" }).data
  const accountLabel = (code: string) => {
    const name = accounts.find((a) => a.code === code)?.nameId
    return name ? `${code} · ${name}` : code
  }

  return (
    <MasterPage<PurchaseItem>
      path={PURCHASE_ITEMS}
      noun="item pembelian"
      empty={empty}
      codePlaceholder="IA011002"
      searchText={(p) => [p.name, p.group, p.unit, p.remarks, accountLabel(p.account)]}
      filters={[{ label: "grup", value: (p) => p.group }]}
      columns={[
        { header: "Nama", cell: (p) => <span className="whitespace-normal">{p.name}</span> },
        { header: "Grup", cell: (p) => p.group, className: "hidden md:table-cell" },
        { header: "Satuan", cell: (p) => p.unit },
        { header: "Akun pembukuan", cell: (p) => accountLabel(p.account) || "—", className: "hidden lg:table-cell" },
      ]}
      fields={(form, set) => (
        <>
          <Field>
            <FieldLabel htmlFor="name">Nama</FieldLabel>
            <Input id="name" value={form.name} onChange={(e) => set({ name: e.target.value })} required />
          </Field>
          <div className="grid grid-cols-[1fr_8rem] gap-4">
            <Field>
              <FieldLabel htmlFor="group">Grup</FieldLabel>
              <Input id="group" value={form.group} onChange={(e) => set({ group: e.target.value })} placeholder="原料 - 低压 HDPE" required />
            </Field>
            <Field>
              <FieldLabel htmlFor="unit">Satuan</FieldLabel>
              <Input id="unit" value={form.unit} onChange={(e) => set({ unit: e.target.value })} placeholder="kg" required />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="remarks">Keterangan</FieldLabel>
            <Input id="remarks" value={form.remarks} onChange={(e) => set({ remarks: e.target.value })} placeholder="Extruder / Laminasi" />
          </Field>
          <Field>
            <FieldLabel htmlFor="account">Akun pembukuan</FieldLabel>
            <SimpleSelect
              id="account"
              value={form.account}
              onChange={(account) => set({ account })}
              options={accounts
                .filter((a) => a.active || a.code === form.account)
                .map((a) => ({ value: a.code, label: `${a.code} · ${a.nameId}` }))}
              placeholder="Pilih akun"
              required
            />
          </Field>
        </>
      )}
      importers={[
        {
          // TYPE_TERPAL_DAN_BAHAN_BAKU.xlsx. Column A and G are unused.
          sheet: "BAHAN",
          fromRow: 3,
          toRow: 235,
          codeColumn: 1,
          columns: [
            { col: "B", header: "Kode", required: true, example: "IA0001" },
            { col: "C", header: "Grup", example: "Bahan baku" },
            { col: "D", header: "Nama", required: true, example: "Biji plastik PP" },
            { col: "E", header: "Satuan", example: "kg" },
            { col: "F", header: "Keterangan" },
            { col: "H", header: "Kode grup", example: "BB" },
            { col: "I", header: "Nama grup", example: "Bahan baku" },
          ],
          parse: ([, code = "", group = "", name = "", unit = "", remarks = "", , groupCode = "", groupName = ""]) =>
            name ? { code, data: { name, group: group || groupName, unit, remarks, groupCode } } : "Nama kosong.",
          defaults: empty,
          newNote: `dibukukan ke ${DEFAULT_BOOKING_ACCOUNT}`,
        },
      ]}
    />
  )
}
