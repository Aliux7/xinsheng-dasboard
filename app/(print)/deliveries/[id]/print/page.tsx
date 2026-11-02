import { Suspense } from "react"

import { DeliveryPrint } from "./delivery-print"

/** Print view of one delivery note, without the app's sidebar or header (see delivery-print.tsx). */
export default function DeliveryPrintPage({ params }: PageProps<"/deliveries/[id]/print">) {
  return <Suspense fallback={null}>{params.then(({ id }) => <DeliveryPrint id={id} />)}</Suspense>
}
