import type { letterheadText } from "@/lib/documents"

/** Company letterhead at the top of a printed document (none when off in Pengaturan). */
export function Letterhead({ letterhead }: { letterhead: ReturnType<typeof letterheadText> }) {
  if (!letterhead) return null
  return (
    <header style={{ borderBottom: "1.5pt solid #000", paddingBottom: "1.5mm", marginBottom: "3mm" }}>
      <div style={{ fontSize: "14pt", fontWeight: 700 }}>{letterhead.name}</div>
      {letterhead.address && <div style={{ fontSize: "9pt", whiteSpace: "pre-line" }}>{letterhead.address}</div>}
      {letterhead.contact && <div style={{ fontSize: "9pt" }}>{letterhead.contact}</div>}
    </header>
  )
}
