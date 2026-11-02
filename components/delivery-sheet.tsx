import { Letterhead } from "@/components/letterhead"
import { DELIVERY_ROWS, LEFT, SHORT_SIGNATURE_LINE, SIGNATURE_LINE, type DeliveryContent, type letterheadText } from "@/lib/documents"
import { formatNumber } from "@/lib/utils"

/**
 * Delivery note as printed (sheet SJ-IND), A4 landscape: Indonesian part on the left, Chinese summary
 * on the right. One table per bordered box, every bordered cell with a 1px black line on all four sides.
 * The JUMLAH | NAMA BARANG table always has 18 rows, so the signatures stay in place. The Excel export
 * (`deliveryLayout`) uses the same content.
 */

const LINE = "1px solid #000"
const box: React.CSSProperties = { border: LINE, padding: "0.4mm 1.5mm", verticalAlign: "middle" }
const table: React.CSSProperties = { borderCollapse: "collapse", tableLayout: "fixed", width: "100%" }
/** Item-table row height: 18 rows + letterhead + signatures fit on one A4 landscape page. */
const ROW = "4.4mm"
const itemCell: React.CSSProperties = { ...box, padding: "0 1.5mm", height: ROW, lineHeight: 1.1 }
const leftTotal = LEFT.reduce((s, w) => s + w, 0)
const pct = (...widths: number[]) => `${(widths.reduce((s, w) => s + w, 0) / leftTotal) * 100}%`
const num = (n: number | null) => (n == null ? "" : formatNumber(n))
const percent = (n: number | null) => (n == null ? "" : `${formatNumber(Math.round(n * 10000) / 100)}%`)

export function DeliverySheet({ content: c, letterhead }: { content: DeliveryContent; letterhead: ReturnType<typeof letterheadText> }) {
  const rows = Math.max(DELIVERY_ROWS, c.lines.length)
  const t = c.totals
  const right = (style: React.CSSProperties = {}): React.CSSProperties => ({ ...box, padding: "0.4mm 1mm", textAlign: "right", whiteSpace: "nowrap", ...style })
  return (
    <div style={{ fontSize: "8.5pt", lineHeight: 1.25, color: "#000" }}>
      <Letterhead letterhead={letterhead} />
      <div style={{ display: "grid", gridTemplateColumns: "47fr 53fr", gap: "6mm", alignItems: "start" }}>
        {/* Indonesian part */}
        <div>
          <table style={{ ...table, width: pct(LEFT[4], LEFT[5]), marginLeft: "auto", textAlign: "center" }}>
            <tbody>
              <tr>
                <td style={{ ...box, fontWeight: 700, width: "36%" }}>TGL.</td>
                <td style={box}>{c.date}</td>
              </tr>
              <tr>
                <td style={box} colSpan={2}>
                  KEPADA YTH.
                </td>
              </tr>
              <tr>
                <td style={{ ...box, fontSize: "11pt", fontWeight: 700 }} colSpan={2}>
                  {c.customerName}
                </td>
              </tr>
            </tbody>
          </table>

          {/* Fixed heights keep the item table (and so the signatures) in the same place. */}
          <div style={{ marginTop: "2mm", minHeight: "19mm" }}>
          <table style={{ borderCollapse: "collapse", fontSize: "10pt" }}>
            <tbody>
              <tr>
                <td style={{ paddingRight: "3mm", whiteSpace: "nowrap", verticalAlign: "top" }}>DIKIRIM KE :</td>
                <td style={{ fontWeight: 700 }}>{c.destination}</td>
              </tr>
              {c.recipient.map((text) => (
                <tr key={text}>
                  <td />
                  <td style={{ fontSize: "8.5pt" }}>{text}</td>
                </tr>
              ))}
              {c.phone && (
                <tr>
                  <td style={{ paddingRight: "3mm" }}>NO. TELP:</td>
                  <td style={{ fontSize: "8.5pt" }}>{c.phone}</td>
                </tr>
              )}
            </tbody>
          </table>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto auto", columnGap: "2mm", alignItems: "baseline", margin: "1mm 0 1.5mm", minHeight: "10mm", alignContent: "start" }}>
            <span style={{ fontWeight: 700 }}>SURAT JALAN NO.</span>
            <span style={{ fontWeight: 700, fontSize: "11pt" }}>{c.number}</span>
            <span style={{ textAlign: "right" }}>NO.POL :</span>
            <span style={{ fontSize: "10pt" }}>{c.plate}</span>
            {c.container && (
              <>
                <span />
                <span />
                <span style={{ textAlign: "right" }}>NO. CONT :</span>
                <span style={{ fontSize: "10pt" }}>{c.container}</span>
              </>
            )}
          </div>

          <table style={table}>
            <colgroup>
              <col style={{ width: pct(LEFT[0]) }} />
              <col style={{ width: pct(LEFT[1]) }} />
              <col />
            </colgroup>
            <tbody>
              <tr style={{ fontWeight: 700, textAlign: "center" }}>
                <td style={itemCell} colSpan={2}>
                  JUMLAH
                </td>
                <td style={itemCell}>NAMA BARANG</td>
              </tr>
              {Array.from({ length: rows }, (_, i) => {
                const l = c.lines[i]
                return (
                  <tr key={i}>
                    <td style={{ ...itemCell, textAlign: "center" }}>{l ? num(l.qty) : ""}</td>
                    <td style={{ ...itemCell, textAlign: "center" }}>{l?.unit ?? ""}</td>
                    <td style={{ ...itemCell, whiteSpace: "nowrap", overflow: "hidden" }}>{l?.name ?? ""}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          <div style={{ display: "grid", gridTemplateColumns: `${pct(LEFT[0], LEFT[1], LEFT[2])} ${pct(LEFT[3])} 1fr`, textAlign: "center", marginTop: "2mm", breakInside: "avoid" }}>
            <span>Penerima</span>
            <span>Pengantar</span>
            <span>Hormat kami,</span>
            <span style={{ height: "11mm" }} />
            <span />
            <span />
            <span>{SIGNATURE_LINE}</span>
            <span>{c.driver ? `( ${c.driver} )` : SHORT_SIGNATURE_LINE}</span>
            <span>{SIGNATURE_LINE}</span>
            {c.driverPhone && (
              <>
                <span />
                <span>{c.driverPhone}</span>
                <span />
              </>
            )}
          </div>
        </div>

        {/* Chinese summary */}
        <div>
          <table style={{ borderCollapse: "collapse", marginBottom: "3mm" }}>
            <tbody>
              {(
                [
                  ["日期:", c.date],
                  ["单子:", c.number],
                  ["客户:", c.customerName],
                  ["地址:", c.area],
                  ["司机:", [c.driver, c.driverPhone].filter(Boolean).join(" - ")],
                  ["总数量:", `${num(t.qty)}  支`],
                  ["总毛重:", `${num(t.gross)}  Kg`],
                  ["地磅重:", c.weighed ? `${num(t.scale)}  Kg` : ""],
                ] as const
              )
                .filter(([, value]) => value)
                .map(([label, value]) => (
                  <tr key={label}>
                    <td style={{ padding: "0.4mm 3mm 0.4mm 0", whiteSpace: "nowrap" }}>{label}</td>
                    <td>{value}</td>
                  </tr>
                ))}
            </tbody>
          </table>

          <table style={table}>
            <colgroup>
              <col style={{ width: "5%" }} />
              <col />
              {c.stickers && <col style={{ width: "11%" }} />}
              <col style={{ width: "7%" }} />
              <col style={{ width: "9.5%" }} />
              <col style={{ width: "9.5%" }} />
              {c.weighed && (
                <>
                  <col style={{ width: "9.5%" }} />
                  <col style={{ width: "7.5%" }} />
                  <col style={{ width: "7%" }} />
                  <col style={{ width: "8%" }} />
                </>
              )}
            </colgroup>
            <tbody>
              <tr style={{ fontWeight: 700, textAlign: "center", lineHeight: 1.1 }}>
                <td style={{ ...box, textAlign: "left" }} colSpan={2}>
                  产品备细 :
                </td>
                {c.stickers && <td style={box}>唛头</td>}
                <td style={box}>数量</td>
                <td style={box}>净重</td>
                <td style={box}>毛重</td>
                {c.weighed && (
                  <>
                    <td style={box}>地磅重</td>
                    <td style={box}>平均 Kg</td>
                    <td style={box}>超重</td>
                    <td style={box}>超重 %</td>
                  </>
                )}
              </tr>
              {c.lines.map((l, i) => (
                <tr key={i}>
                  <td style={{ ...box, textAlign: "center" }}>{i + 1}.</td>
                  <td style={box}>{l.nameZh}</td>
                  {c.stickers && <td style={box}>{l.sticker}</td>}
                  <td style={right({ fontWeight: 700 })}>{num(l.qty)}</td>
                  <td style={right()}>{num(l.net)}</td>
                  <td style={right()}>{num(l.gross)}</td>
                  {c.weighed && (
                    <>
                      <td style={right()}>{num(l.scale)}</td>
                      <td style={right()}>{num(l.average)}</td>
                      <td style={right()}>{num(l.over)}</td>
                      <td style={right()}>{percent(l.overPct)}</td>
                    </>
                  )}
                </tr>
              ))}
              <tr style={{ fontWeight: 700 }}>
                <td style={right()} colSpan={c.stickers ? 3 : 2}>
                  总额
                </td>
                <td style={right()}>{num(t.qty)}</td>
                <td style={right()}>{num(t.net)}</td>
                <td style={right()}>{num(t.gross)}</td>
                {c.weighed && (
                  <>
                    <td style={right()}>{num(t.scale)}</td>
                    <td style={right()}>{num(t.average)}</td>
                    <td style={right()}>{num(t.over)}</td>
                    <td style={right()}>{percent(t.overPct)}</td>
                  </>
                )}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
