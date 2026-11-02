"use client"

import { useAuth } from "@/components/auth-provider"
import { DeliverySheet } from "@/components/delivery-sheet"
import { PrintPage } from "@/components/print-page"
import { useCollection, useDocument } from "@/hooks/use-collection"
import { useCompany } from "@/hooks/use-company"
import { CUSTOMERS, DELIVERIES, PRODUCTS, type Customer, type Delivery, type Product } from "@/lib/collections"
import { deliveryContent, letterheadText } from "@/lib/documents"

export function DeliveryPrint({ id }: { id: string }) {
  const { user, loading: authLoading } = useAuth()
  const delivery = useDocument<Delivery>(DELIVERIES, id)
  const customer = useDocument<Customer>(CUSTOMERS, delivery.data?.customer)
  const products = useCollection<Product>(PRODUCTS)
  const { company, loading: companyLoading } = useCompany()
  const ready = !!delivery.data && !customer.loading && !products.loading && !companyLoading
  const message = authLoading || (user && delivery.loading) ? "Memuat…" : !user ? "Silakan masuk terlebih dahulu." : !delivery.data ? "Surat jalan tidak ditemukan." : null

  return (
    <PrintPage orientation="landscape" title={`Surat jalan ${delivery.data?.number ?? ""}`} ready={ready} message={message}>
      {delivery.data && <DeliverySheet content={deliveryContent(delivery.data, customer.data ?? undefined, products.data)} letterhead={letterheadText(company)} />}
    </PrintPage>
  )
}
