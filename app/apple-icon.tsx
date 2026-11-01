import { brandIcon } from "@/lib/brand-icon"

export const size = { width: 180, height: 180 }
export const contentType = "image/png"

/** Home-screen icon for iPhone/iPad, generated from the logo font. */
export default function AppleIcon() {
  return brandIcon(size.width)
}
