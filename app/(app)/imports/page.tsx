"use client"

import { CheckIcon } from "lucide-react"

import { useAuth, useCanCloseMonth } from "@/components/auth-provider"
import { JournalImport } from "@/components/imports/journal-import"
import { PurchaseInvoiceImport } from "@/components/imports/purchase-invoice-import"
import { RollImport } from "@/components/imports/roll-import"
import { WarehouseImport } from "@/components/imports/warehouse-import"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useCollection } from "@/hooks/use-collection"

/** The one-time imports, in the order they should be run; ✓ once done. */
const IMPORTS = [
  { id: "warehouse-history", label: "Riwayat gudang", Component: WarehouseImport },
  { id: "loom-rolls", label: "Roll loom", Component: RollImport },
  { id: "journal-2025", label: "Jurnal 2025", Component: JournalImport },
  { id: "purchase-invoices-2025", label: "Faktur pembelian 2025", Component: PurchaseInvoiceImport },
]

export default function ImportsPage() {
  const allowed = useCanCloseMonth()
  const { roleLoaded } = useAuth()
  const markers = useCollection<{ id: string; status: string }>("imports").data
  const done = (id: string) => markers.some((m) => m.id === id && m.status === "done")

  if (!roleLoaded) return null
  if (!allowed) {
    return (
      <p className="max-w-2xl text-sm text-muted-foreground">
        Hanya Developer, Master atau Admin yang dapat menjalankan impor data. Minta Developer atau Master mengubah peran Anda di halaman Pengguna.
      </p>
    )
  }

  return (
    <Tabs defaultValue={IMPORTS.find((i) => !done(i.id))?.id ?? IMPORTS[0].id} className="gap-6">
      <TabsList className="h-auto flex-wrap">
        {IMPORTS.map((imp, n) => (
          <TabsTrigger key={imp.id} value={imp.id}>
            {done(imp.id) ? <CheckIcon className="text-green-600" /> : <span className="text-muted-foreground">{n + 1}.</span>}
            {imp.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {IMPORTS.map(({ id, Component }) => (
        <TabsContent key={id} value={id} className="flex flex-col gap-6">
          <Component />
        </TabsContent>
      ))}
      <p className="text-xs text-muted-foreground">
        Jalankan berurutan. Sebelumnya, pastikan data master sudah diimpor (pemasok, bahan baku, tipe kain & mesin, daftar akun) dan firestore.rules sudah
        dipublikasikan. Setiap impor hanya bisa dijalankan sekali.
      </p>
    </Tabs>
  )
}
