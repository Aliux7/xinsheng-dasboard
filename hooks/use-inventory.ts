"use client"

import { useCollection } from "@/hooks/use-collection"
import {
  MATERIALS,
  MATERIAL_MAPS,
  PURCHASE_INVOICES,
  STOCK_MOVEMENTS,
  WEIGHINGS,
  type Material,
  type MaterialMap,
  type PurchaseInvoice,
  type StockMovement,
  type Weighing,
} from "@/lib/collections"
import { deliveryValues, valuation } from "@/lib/inventory"
import { monthRange } from "@/lib/utils"

/** Inventory valuation up to `lastMonth` ("" = not yet known), keyed by month. */
export function useInventory(lastMonth: string) {
  const [, end] = lastMonth ? monthRange(lastMonth) : ["", ""]
  const movements = useCollection<StockMovement>(STOCK_MOVEMENTS, { where: [["date", "<", end]], skip: !lastMonth })
  const materials = useCollection<Material>(MATERIALS)
  const weighings = useCollection<Weighing>(WEIGHINGS, { where: [["status", "==", "stocked"]] })
  const invoices = useCollection<PurchaseInvoice>(PURCHASE_INVOICES)
  const maps = useCollection<MaterialMap>(MATERIAL_MAPS)
  const loading = movements.loading || materials.loading || weighings.loading || invoices.loading || maps.loading
  const byMonth = loading || !lastMonth ? new Map() : valuation(movements.data, materials.data, deliveryValues(weighings.data, invoices.data, maps.data), lastMonth)
  return { byMonth, loading, error: movements.error }
}
