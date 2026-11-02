import { Suspense } from "react"

import { InvoicePrint } from "./invoice-print"

/** Print view of one sales invoice, without the app's sidebar or header (see invoice-print.tsx). */
export default function SalesInvoicePrintPage({ params }: PageProps<"/sales-invoices/[id]/print">) {
  return <Suspense fallback={null}>{params.then(({ id }) => <InvoicePrint id={id} />)}</Suspense>
}
