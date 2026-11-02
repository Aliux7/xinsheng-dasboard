"use client"

import { useEffect, useRef } from "react"
import { PrinterIcon } from "lucide-react"

import { Button } from "@/components/ui/button"

/**
 * Shell of a print route (app/(print)/…): an A4 sheet with no browser margin (@page margin 0), so the
 * browser has nowhere to print its date, title or URL; the 12 mm margin is the sheet's own padding.
 * Opens the print dialog once `ready`; `title` becomes the default PDF file name.
 */
export function PrintPage({ orientation, title, ready, message, children }: { orientation: "portrait" | "landscape"; title: string; ready: boolean; message: string | null; children: React.ReactNode }) {
  const printed = useRef(false)
  const [w, h] = orientation === "portrait" ? ["210mm", "297mm"] : ["297mm", "210mm"]

  useEffect(() => {
    if (!ready || printed.current) return
    printed.current = true
    document.title = title
    const timer = setTimeout(() => window.print(), 300)
    return () => clearTimeout(timer)
  }, [ready, title])

  return (
    <div className="print-page">
      <style>{`
@page { size: A4 ${orientation}; margin: 0; }
.print-page, .print-page * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.print-page { min-height: 100vh; background: #e5e5e5; color: #000; }
.print-page .sheet { width: ${w}; min-height: ${h}; padding: 12mm; margin: 0 auto 10mm; background: #fff; box-shadow: 0 1px 4px rgb(0 0 0 / 0.2); box-sizing: border-box; }
@media print {
  .print-page { background: #fff; min-height: 0; }
  .print-page .toolbar { display: none; }
  /* A longer document flows onto the next page (padding repeated there) instead of being cut off. */
  .print-page .sheet { margin: 0; box-shadow: none; min-height: 0; box-decoration-break: clone; -webkit-box-decoration-break: clone; }
  .print-page tr { break-inside: avoid; }
}
`}</style>
      <div className="toolbar flex items-center justify-center gap-2 py-4">
        <Button onClick={() => window.print()} disabled={!ready}>
          <PrinterIcon />
          Cetak / simpan PDF
        </Button>
        <Button variant="outline" onClick={() => window.close()}>
          Tutup
        </Button>
      </div>
      <div className="sheet">{message ? <p style={{ textAlign: "center" }}>{message}</p> : ready && children}</div>
    </div>
  )
}
