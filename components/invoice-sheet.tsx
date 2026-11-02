import { Letterhead } from "@/components/letterhead"
import { INVOICE, SIGNATURE_LINE, type InvoiceContent, type letterheadText } from "@/lib/documents"
import { formatNumber } from "@/lib/utils"

/**
 * Sales invoice as printed (sheet FAKTUR): one table per bordered box, every bordered cell with a
 * 1px black line on all four sides. The Excel export (`invoiceLayout`) uses the same content.
 */

const total = INVOICE.reduce((s, w) => s + w, 0)
const pct = (...widths: number[]) => `${(widths.reduce((s, w) => s + w, 0) / total) * 100}%`
/** Width of columns D–E (HARGA + JUMLAH): the date box and the signature sit there. */
const right = pct(INVOICE[3], INVOICE[4])

const LINE = "1px solid #000"
const box: React.CSSProperties = { border: LINE, padding: "1.2mm 2mm", verticalAlign: "middle" }
const table: React.CSSProperties = { borderCollapse: "collapse", tableLayout: "fixed" }
const num = (n: number) => formatNumber(n)

export function InvoiceSheet({ content: c, letterhead }: { content: InvoiceContent; letterhead: ReturnType<typeof letterheadText> }) {
  return (
    <div style={{ fontSize: "10pt", lineHeight: 1.3, color: "#000" }}>
      <Letterhead letterhead={letterhead} />

      <table style={{ ...table, width: right, marginLeft: "auto", textAlign: "center" }}>
        <tbody>
          <tr>
            <td style={box}>TANGGAL</td>
            <td style={box}>{c.date}</td>
          </tr>
          <tr>
            <td style={box} colSpan={2}>
              KEPADA YTH.
            </td>
          </tr>
          <tr>
            <td style={{ ...box, fontSize: "12pt", fontWeight: 700 }} colSpan={2}>
              {c.customerName}
            </td>
          </tr>
          {c.city && (
            <tr>
              <td style={{ ...box, fontSize: "12pt", fontWeight: 700 }} colSpan={2}>
                {c.city}
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div style={{ display: "flex", alignItems: "baseline", gap: "4mm", margin: "6mm 0 3mm" }}>
        <span style={{ fontSize: "11pt" }}>FAKTUR NO :</span>
        <span style={{ fontSize: "13pt", fontWeight: 700 }}>{c.number}</span>
        {c.deliveries && <span style={{ marginLeft: "auto", textAlign: "right" }}>{c.deliveries}</span>}
      </div>

      <table style={{ ...table, width: "100%" }}>
        <colgroup>
          {INVOICE.map((w, i) => (
            <col key={i} style={{ width: pct(w) }} />
          ))}
        </colgroup>
        <tbody>
          <tr style={{ fontWeight: 700, textAlign: "center" }}>
            <td style={box} colSpan={2}>
              BANYAKNYA
            </td>
            <td style={box}>NAMA BARANG</td>
            <td style={box}>HARGA</td>
            <td style={box}>JUMLAH</td>
          </tr>
          {c.lines.map((l, i) => (
            <tr key={i}>
              <td style={{ ...box, textAlign: "center" }}>{num(l.qty)}</td>
              <td style={{ ...box, textAlign: "center" }}>{l.unit}</td>
              <td style={box}>{l.name}</td>
              <td style={{ ...box, textAlign: "right" }}>{num(l.price)}</td>
              <td style={{ ...box, textAlign: "right" }}>{num(l.amount)}</td>
            </tr>
          ))}
          {c.tax && (
            <>
              <tr>
                <td colSpan={3} />
                <td style={{ ...box, textAlign: "center" }}>DPP</td>
                <td style={{ ...box, textAlign: "right" }}>{num(c.tax.dpp)}</td>
              </tr>
              <tr>
                <td colSpan={3} />
                <td style={{ ...box, textAlign: "center" }}>{c.tax.label}</td>
                <td style={{ ...box, textAlign: "right" }}>{num(c.tax.ppn)}</td>
              </tr>
            </>
          )}
          <tr>
            <td style={{ ...box, textAlign: "center", fontSize: "11pt" }} colSpan={3}>
              {c.words}
            </td>
            <td style={{ ...box, textAlign: "center", fontWeight: 700 }}>TOTAL RP:</td>
            <td style={{ ...box, textAlign: "right", fontWeight: 700, fontSize: "12pt" }}>{num(c.total)}</td>
          </tr>
        </tbody>
      </table>

      {/* Under HARGA / JUMLAH: about 25 mm for stamp and signature. */}
      <div style={{ width: right, marginLeft: "auto", marginTop: "5mm", textAlign: "center" }}>
        <div>Hormat Kami,</div>
        <div style={{ height: "25mm" }} />
        <div>{SIGNATURE_LINE}</div>
      </div>

      {c.payment.length > 0 && (
        <table style={{ borderCollapse: "collapse", marginTop: "6mm" }}>
          <tbody>
            {c.payment.map(([label, value]) => (
              <tr key={label}>
                <td style={{ padding: "0.5mm 3mm 0.5mm 0", whiteSpace: "nowrap" }}>{label}</td>
                <td style={{ padding: "0.5mm 0" }}>: {value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
