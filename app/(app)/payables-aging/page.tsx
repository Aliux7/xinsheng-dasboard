"use client"

import { AgingPage } from "@/components/aging-page"
import { useCollection } from "@/hooks/use-collection"
import { PURCHASE_ACCOUNTS, PURCHASE_INVOICES, type PurchaseInvoice } from "@/lib/collections"

export default function PayablesAgingPage() {
  const invoices = useCollection<PurchaseInvoice>(PURCHASE_INVOICES)
  return (
    <AgingPage
      docs={invoices.data.map((i) => ({
        id: i.id,
        number: i.number,
        party: i.supplier || i.supplierName,
        partyName: i.supplierName,
        date: i.date,
        dueDate: i.dueDate,
        total: i.payable,
        payments: i.payments,
      }))}
      loading={invoices.loading}
      accounts={[PURCHASE_ACCOUNTS.payableIdr, PURCHASE_ACCOUNTS.payableUsd]}
      sign={-1}
      partyLabel="Pemasok"
      fileName="Umur_utang"
    />
  )
}
