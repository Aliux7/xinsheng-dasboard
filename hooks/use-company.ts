"use client"

import { useCollection } from "@/hooks/use-collection"
import { COMPANY_SETTINGS, SETTINGS, type CompanySettings } from "@/lib/collections"

/** Company settings (letterhead) from Pengaturan; null until saved once. */
export function useCompany() {
  const settings = useCollection<CompanySettings>(SETTINGS)
  return { company: settings.data.find((s) => s.id === COMPANY_SETTINGS) ?? null, loading: settings.loading }
}
