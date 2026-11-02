"use client"

import { InvoiceSheet } from "@/components/invoice-sheet"
import { useAuth } from "@/components/auth-provider"
import { PrintPage } from "@/components/print-page"
import { useCollection, useDocument } from "@/hooks/use-collection"
import { useCompany } from "@/hooks/use-company"
import { CUSTOMERS, PRODUCTS, SALES_INVOICES, type Customer, type Product, type SalesInvoice } from "@/lib/collections"
import { invoiceContent, letterheadText } from "@/lib/documents"

export function InvoicePrint({ id }: { id: string }) {
  const { user, loading: authLoading } = useAuth()
  const invoice = useDocument<SalesInvoice>(SALES_INVOICES, id)
  const customer = useDocument<Customer>(CUSTOMERS, invoice.data?.customer)
  const products = useCollection<Product>(PRODUCTS)
  const { company, loading: companyLoading } = useCompany()
  const ready = !!invoice.data && !customer.loading && !products.loading && !companyLoading
  const message = authLoading || (user && invoice.loading) ? "Memuat…" : !user ? "Silakan masuk terlebih dahulu." : !invoice.data ? "Faktur tidak ditemukan." : null

  return (
    <PrintPage orientation="portrait" title={`Faktur ${invoice.data?.number ?? ""}`} ready={ready} message={message}>
      {invoice.data && <InvoiceSheet content={invoiceContent(invoice.data, customer.data ?? undefined, products.data)} letterhead={letterheadText(company)} />}
    </PrintPage>
  )
}
