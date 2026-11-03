"use client"

import { useState } from "react"
import { toast } from "sonner"

import { AccountSelect } from "@/components/account-select"
import { DataTable } from "@/components/data-table"
import { ImportHeading, ImportTemplate } from "@/components/import-template"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import type { Account, Bank, Journal } from "@/lib/collections"
import { BANK_TEMPLATE, buildStatement, contraError, readStatement, type StatementRow } from "@/lib/bank-import"
import { round2, saveBankEntry } from "@/lib/journal"
import { formatDay, formatNumber } from "@/lib/utils"

type Row = StatementRow & { id: string; picked: boolean; failed?: string }

/** Mutasi rekening → one BBM/BBK entry per ticked row, after a preview where contra accounts are chosen. */
export function BankImport({ bank, journals, accounts, onDone }: { bank: Bank; journals: Journal[]; accounts: Account[]; onDone: () => void }) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [fill, setFill] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const codes = new Set(accounts.filter((a) => a.active).map((a) => a.code))
  const problem = (r: Row) => r.error ?? contraError(r.contra, codes)
  const update = (id: string, patch: Partial<Row>) => setRows((rs) => rs!.map((r) => (r.id === id ? { ...r, ...patch } : r)))

  async function load(file: File | undefined) {
    setRows(null)
    setError(null)
    if (!file) return
    try {
      const parsed = buildStatement(await readStatement(file), bank.account, journals)
      if (!parsed.length) return setError("Tidak ada baris mutasi di sheet pertama.")
      setRows(parsed.map((r) => ({ ...r, id: String(r.row), picked: !r.error && !r.duplicate })))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const ready = rows?.filter((r) => r.picked && !problem(r)) ?? []
  const total = (direction: "in" | "out") => round2(ready.filter((r) => r.direction === direction).reduce((s, r) => s + r.amount, 0))

  // One transaction per row: a closed month or a bad row doesn't stop the others.
  async function save() {
    if (!ready.length) return
    setSaving(true)
    const failed = new Map<string, string>()
    let saved = 0
    for (const r of ready) {
      try {
        await saveBankEntry({
          bank: bank.code,
          date: r.date,
          name: r.name,
          description: r.reference ? `${r.description} (${r.reference})` : r.description,
          contra: r.contra,
          direction: r.direction,
          amount: r.amount,
        })
        saved++
      } catch (err) {
        failed.set(r.id, err instanceof Error ? err.message : String(err))
      }
    }
    setSaving(false)
    if (saved) toast.success(`${saved} mutasi ${bank.name} disimpan.`)
    if (!failed.size) return onDone()
    setRows((rs) => rs!.filter((r) => !ready.includes(r) || failed.has(r.id)).map((r) => ({ ...r, failed: failed.get(r.id) })))
    setError(`${failed.size} baris gagal disimpan; lihat kolom Status.`)
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <ImportHeading title={`Import mutasi ${bank.name}`}>
        Setiap baris menjadi satu jurnal BBM (masuk) atau BBK (keluar) di bank ini, berlawanan dengan akun lawan baris itu. Pembayaran faktur tetap dicatat di
        Penerimaan pelanggan atau Pembayaran pemasok. Baris yang tanggal dan jumlahnya sudah ada di buku tidak dicentang.
      </ImportHeading>
      <ImportTemplate sheets={BANK_TEMPLATE} fileName="template-mutasi-bank.xlsx" onFile={load} disabled={saving} />
      {rows && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-full sm:w-80">
              <AccountSelect value={fill} onChange={setFill} accounts={accounts} placeholder="Akun lawan untuk baris kosong" />
            </div>
            <Button variant="outline" disabled={!fill} onClick={() => setRows((rs) => rs!.map((r) => (r.contra ? r : { ...r, contra: fill })))}>
              Terapkan
            </Button>
          </div>
          <DataTable
            columns={[
              {
                header: "",
                cell: (r) => <Checkbox checked={r.picked} disabled={!!r.error} onCheckedChange={(picked) => update(r.id, { picked })} aria-label={`Baris ${r.row}`} />,
              },
              { header: "Baris", cell: (r) => r.row, className: "tabular-nums" },
              { header: "Tanggal", cell: (r) => (r.date ? formatDay(r.date) : "—") },
              {
                header: "Keterangan",
                cell: (r) => (
                  <span className="whitespace-normal">
                    {r.name && <span className="font-medium">{r.name} · </span>}
                    {r.description}
                    {r.reference && <span className="text-muted-foreground"> ({r.reference})</span>}
                  </span>
                ),
              },
              { header: "Masuk", cell: (r) => (r.direction === "in" && r.amount ? formatNumber(r.amount) : ""), className: "text-right tabular-nums" },
              { header: "Keluar", cell: (r) => (r.direction === "out" && r.amount ? formatNumber(r.amount) : ""), className: "text-right tabular-nums" },
              {
                header: "Akun lawan",
                cell: (r) => (
                  <div className="w-64">
                    <AccountSelect value={r.contra} onChange={(contra) => update(r.id, { contra })} accounts={accounts} placeholder="Pilih akun" />
                  </div>
                ),
              },
              {
                header: "Status",
                cell: (r) => {
                  const p = r.failed ?? problem(r)
                  if (p) return <span className="text-xs whitespace-normal text-destructive">{p}</span>
                  if (r.duplicate) return <Badge variant="outline" title={r.duplicate}>Mungkin sudah ada</Badge>
                  return <Badge variant="secondary">Siap</Badge>
                },
                className: "max-w-56",
              },
            ]}
            data={rows}
            loading={false}
            error={null}
            rowClassName={(r) => (r.picked ? undefined : "text-muted-foreground")}
          />
          <p className="text-sm">
            {ready.length} dari {rows.length} baris akan disimpan · masuk <strong>{formatNumber(total("in"))}</strong> · keluar <strong>{formatNumber(total("out"))}</strong>
          </p>
        </>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {rows && (
        <Button className="w-fit" onClick={save} disabled={saving || !ready.length}>
          {saving ? "Menyimpan…" : `Simpan ${ready.length} mutasi`}
        </Button>
      )}
    </div>
  )
}
