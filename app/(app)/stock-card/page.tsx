"use client"

import { Suspense, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { FileDownIcon } from "lucide-react"

import { DataTable, type Column } from "@/components/data-table"
import { SimpleSelect } from "@/components/simple-select"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useCollection } from "@/hooks/use-collection"
import { MATERIALS, STOCK_KINDS, STOCK_MOVEMENTS, type Material, type StockMovement } from "@/lib/collections"
import { downloadExcel } from "@/lib/export"
import { round3 } from "@/lib/stock"
import { formatDay, formatNumber } from "@/lib/utils"

type Row = {
  id: string
  date: string
  type: string
  number: string
  sourceId: string
  in: number | null
  out: number | null
  balance: number
  /** Opening / closing rows. */
  total?: boolean
}

/** Same-day movements in the order they were saved. */
const byDateThenTime = (a: StockMovement, b: StockMovement) =>
  a.date.localeCompare(b.date) || (a.at?.toMillis() ?? 0) - (b.at?.toMillis() ?? 0)

export default function StockCardPage() {
  // Reading ?material= needs a Suspense boundary with cacheComponents.
  return (
    <Suspense>
      <StockCard />
    </Suspense>
  )
}

function StockCard() {
  const router = useRouter()
  const params = useSearchParams()
  const code = params.get("material") ?? ""
  const materials = useCollection<Material>(MATERIALS).data
  const material = materials.find((m) => m.code === code)
  const movements = useCollection<StockMovement>(STOCK_MOVEMENTS, { where: [["material", "==", code]], skip: !code })
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [openDoc, setOpenDoc] = useState<Row | null>(null)

  // The balance is the running sum of movements, ordered by date; opening = everything before `from`.
  const all = [...movements.data].sort(byDateThenTime)
  const opening = round3(all.filter((m) => from && m.date < from).reduce((sum, m) => sum + m.qty, 0))
  const inRange = all.filter((m) => (!from || m.date >= from) && (!to || m.date <= to))
  const lines = inRange.reduce<Row[]>((acc, m) => {
    const balance = round3((acc.at(-1)?.balance ?? opening) + m.qty)
    const row = {
      id: m.id,
      date: m.date,
      type: STOCK_KINDS[m.kind] ?? m.kind,
      number: m.source.number,
      sourceId: m.source.id,
      in: m.qty > 0 ? m.qty : null,
      out: m.qty < 0 ? -m.qty : null,
      balance,
    }
    return [...acc, row]
  }, [])
  const closing = lines.at(-1)?.balance ?? opening
  const rows: Row[] = [
    { id: "opening", date: from, type: "Saldo awal", number: "", sourceId: "", in: null, out: null, balance: opening, total: true },
    ...lines,
    { id: "closing", date: to, type: "Saldo akhir", number: "", sourceId: "", in: null, out: null, balance: closing, total: true },
  ]

  const columns: Column<Row>[] = [
    { header: "Tanggal", cell: (r) => (r.date ? formatDay(r.date) : "—") },
    { header: "Jenis", cell: (r) => r.type },
    {
      header: "No. dokumen",
      cell: (r) =>
        r.number && (
          <button type="button" className="underline-offset-4 hover:underline" onClick={() => setOpenDoc(r)}>
            {r.number}
          </button>
        ),
    },
    { header: "Masuk (kg)", cell: (r) => (r.in == null ? "" : formatNumber(r.in)), className: "text-right tabular-nums" },
    { header: "Keluar (kg)", cell: (r) => (r.out == null ? "" : formatNumber(r.out)), className: "text-right tabular-nums" },
    { header: "Saldo (kg)", cell: (r) => formatNumber(r.balance), className: "text-right font-medium tabular-nums" },
  ]

  const exportExcel = () =>
    downloadExcel(
      `Kartu_stok_${code}${from ? `_${from}` : ""}${to ? `_${to}` : ""}.xlsx`,
      "Kartu stok",
      columns.map((c) => c.header),
      rows.map((r) => [r.date || null, r.type, r.number || null, r.in, r.out, r.balance]),
      [12, 24, 20, 12, 12, 14]
    )

  return (
    <>
      <div className="flex flex-wrap items-end gap-3">
        <Field className="w-full sm:w-80">
          <FieldLabel htmlFor="material">Bahan baku</FieldLabel>
          <SimpleSelect
            id="material"
            value={code}
            onChange={(v) => router.replace(`/stock-card?material=${encodeURIComponent(v)}`)}
            options={materials.map((m) => ({ value: m.code, label: `${m.code} · ${m.name}` }))}
          />
        </Field>
        <Field className="w-40">
          <FieldLabel htmlFor="from">Dari</FieldLabel>
          <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field className="w-40">
          <FieldLabel htmlFor="to">Sampai</FieldLabel>
          <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <Button variant="outline" className="ml-auto" onClick={exportExcel} disabled={!code || movements.loading}>
          <FileDownIcon />
          Ekspor Excel
        </Button>
      </div>
      {material && (
        <p className="text-sm text-muted-foreground">
          {material.code} · {material.name} — stok sekarang <span className="font-medium text-foreground">{formatNumber(material.stock ?? 0)} {material.unit}</span>
        </p>
      )}
      {code ? (
        <DataTable
          columns={columns}
          {...movements}
          data={rows}
          rowClassName={(r) => (r.total ? "bg-muted/50 font-medium" : undefined)}
        />
      ) : (
        <p className="text-sm text-muted-foreground">Pilih bahan baku untuk melihat kartu stoknya.</p>
      )}
      <DocumentDialog row={openDoc} onClose={() => setOpenDoc(null)} materials={materials} />
    </>
  )
}

/** Every stock movement written by one document (e.g. all inputs and the output of a washing). */
function DocumentDialog({ row, onClose, materials }: { row: Row | null; onClose: () => void; materials: Material[] }) {
  const moves = useCollection<StockMovement>(STOCK_MOVEMENTS, { where: [["source.id", "==", row?.sourceId ?? ""]], skip: !row })
  const name = (code: string) => materials.find((m) => m.code === code)?.name ?? ""

  return (
    <Dialog open={row !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{row?.number}</DialogTitle>
        </DialogHeader>
        {row && (
          <>
            <p className="text-sm text-muted-foreground">{formatDay(row.date)}</p>
            <DataTable
              columns={[
                { header: "Bahan", cell: (m) => `${m.material} ${name(m.material)}` },
                { header: "Jenis", cell: (m) => STOCK_KINDS[m.kind] ?? m.kind },
                { header: "Kg", cell: (m) => (m.qty > 0 ? "+" : "") + formatNumber(m.qty), className: "text-right tabular-nums" },
              ]}
              {...moves}
              data={[...moves.data].sort(byDateThenTime)}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
