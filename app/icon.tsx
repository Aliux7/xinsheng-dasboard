import { brandIcon } from "@/lib/brand-icon"

export const size = { width: 64, height: 64 }
export const contentType = "image/png"

/** Browser-tab icon, generated from the logo font. */
export default function Icon() {
  return brandIcon(size.width)
}
