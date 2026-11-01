"use client"

import { useState } from "react"
import { CheckCircle2Icon, TriangleAlertIcon } from "lucide-react"
import { toast } from "sonner"

import { useAuth, useCanCloseMonth } from "@/components/auth-provider"
import { DataTable } from "@/components/data-table"
import { ImportHeading, ImportTemplate } from "@/components/import-template"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Switch } from "@/components/ui/switch"
import { useCollection } from "@/hooks/use-collection"
import { DEPARTMENTS, MATERIALS, STOCK_MOVEMENTS, SUPPLIERS, type Department, type Material, type Supplier } from "@/lib/collections"
import { IMPORT_DOC, MONTHS, WAREHOUSE_TEMPLATE, buildPlan, runImport, type Plan } from "@/lib/history-import"
import { formatDate, formatDay, formatNumber } from "@/lib/utils"

type Marker = {
  id: string
  status: "running" | "done"
  by: { email: string }
  finishedAt?: never
  summary?: Record<string, number | string[]>
}

const SUMMARY_LABELS: Record<string, string> = {
  weighings: "Timbangan masuk",
  washes: "Hasil cuci",
  recycles: "Hasil recycle",
  usages: "Dokumen pemakaian",
  movements: "Pergerakan stok",
  renamed: "No. TM diganti (duplikat)",
  remapped: "Kode pemasok diperbaiki",
  dips: "Stok sempat minus",
  differences: "Selisih dengan sheet bulanan",
}

export function WarehouseImport() {
  const allowed = useCanCloseMonth()
  const { roleLoaded } = useAuth()
  const materials = useCollection<Material>(MATERIALS).data
  const suppliers = useCollection<Supplier>(SUPPLIERS).data
  const departments = useCollection<Department>(DEPARTMENTS).data
  const marker = useCollection<Marker>(IMPORT_DOC.path).data.find((m) => m.id === IMPORT_DOC.id)
  const anyMovement = useCollection(STOCK_MOVEMENTS, { limit: 1 })

  const [plan, setPlan] = useState<Plan | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [accepted, setAccepted] = useState(false)
  const [progress, setProgress] = useState<{
    done: number
    total: number
  } | null>(null)

  if (!roleLoaded) return null
  if (!allowed) {
    return (
      <p className="max-w-2xl text-sm text-muted-foreground">
        Hanya Developer, Master atau Admin yang dapat menjalankan impor riwayat gudang. Akun Anda belum memiliki peran ini — minta Developer atau
        Master mengubah peran Anda di halaman Pengguna.
      </p>
    )
  }

  if (marker?.status === "done") {
    return (
      <div className="flex max-w-xl flex-col gap-4">
        <p className="flex items-center gap-2 font-medium">
          <CheckCircle2Icon className="size-5 text-green-600" />
          Impor riwayat gudang sudah dijalankan oleh {marker.by.email}
          {marker.finishedAt && ` pada ${formatDate(marker.finishedAt)}`}. Tidak bisa dijalankan lagi.
        </p>
        <Summary summary={marker.summary ?? {}} />
      </div>
    )
  }

  const resuming = marker?.status === "running"
  // A clean start is required: otherwise test data would be mixed into the closed months.
  const blockedByData = !resuming && anyMovement.data.length > 0
  const missing = plan ? Object.values(plan.missing).flat() : []
  const canRun = plan && !missing.length && !blockedByData && (!plan.differences.length || accepted) && !progress

  async function load(file: File | undefined) {
    setPlan(null)
    setError(null)
    setAccepted(false)
    if (!file) return
    try {
      setPlan(await buildPlan(file, { materials, suppliers, departments }))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function run() {
    if (!plan || !confirm(`Impor ${plan.events.length} dokumen dan tutup buku ${MONTHS[0]} – ${MONTHS.at(-1)}? Ini hanya bisa dilakukan sekali.`))
      return
    setError(null)
    setProgress({ done: 0, total: plan.events.length })
    try {
      await runImport(plan, { materials, departments }, (done, total) => setProgress({ done, total }))
      toast.success(`Impor selesai: ${plan.events.length} dokumen gudang diimpor.`)
    } catch (err) {
      setError(`${err instanceof Error ? err.message : String(err)} — jalankan lagi untuk melanjutkan dari titik ini.`)
      setProgress(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <ImportHeading title="Impor riwayat gudang">
        Sekali jalan: membaca Laporan Bahan Baku (TIMBANGAN, HASIL CUCI, RECYCLE, OUT), membuat dokumen dan pergerakan stok Mei–September 2026,
        mencocokkan dengan sheet bulanan, lalu menutup buku bulan-bulan itu. Tidak ada yang disimpan sebelum Anda menekan Jalankan impor.
      </ImportHeading>
      {resuming && (
        <Notice>Impor sebelumnya berhenti di tengah jalan. Pilih file yang sama lalu jalankan lagi; dokumen yang sudah masuk dilewati.</Notice>
      )}
      {blockedByData && (
        <Notice>
          Sudah ada pergerakan stok di aplikasi (mis. data percobaan). Hapus dulu semua data timbangan, cuci/recycle, pemakaian, stok opname dan
          stockMovements, serta stok di bahan baku, agar riwayat tidak tercampur.
        </Notice>
      )}

      <ImportTemplate sheets={WAREHOUSE_TEMPLATE} fileName="template-riwayat-gudang.xlsx" onFile={load} disabled={!!progress} />
      {error && <p className="text-sm text-destructive">{error}</p>}

      {plan && (
        <>
          <Summary
            summary={{
              weighings: plan.weighings.length,
              washes: plan.outputs.filter((o) => o.type === "wash").length,
              recycles: plan.outputs.filter((o) => o.type === "recycle").length,
              usages: plan.usages.length,
              renamed: plan.renamed.length,
              remapped: plan.remapped.length,
              dips: plan.dips.length,
              differences: plan.differences.length,
            }}
          />

          {missing.length > 0 && (
            <Notice>
              Kode berikut belum ada di aplikasi, impor dulu di Data Master:{" "}
              {[
                plan.missing.materials.length && `bahan baku ${plan.missing.materials.join(", ")}`,
                plan.missing.suppliers.length && `pemasok ${plan.missing.suppliers.join(", ")}`,
                plan.missing.departments.length && `departemen ${plan.missing.departments.join(", ")}`,
              ]
                .filter(Boolean)
                .join("; ")}
              .
            </Notice>
          )}

          <Section title="Perbandingan dengan sheet bulanan (kolom E–I)">
            {plan.differences.length ? (
              <>
                <DataTable
                  columns={[
                    { header: "Bulan", cell: (d) => d.month },
                    { header: "Bahan", cell: (d) => d.material },
                    { header: "Kolom", cell: (d) => d.field },
                    {
                      header: "Hasil impor",
                      cell: (d) => formatNumber(d.ours),
                      className: "text-right tabular-nums",
                    },
                    {
                      header: "Sheet",
                      cell: (d) => formatNumber(d.sheet),
                      className: "text-right tabular-nums",
                    },
                  ]}
                  data={plan.differences.map((d, i) => ({
                    ...d,
                    id: String(i),
                  }))}
                  loading={false}
                  error={null}
                />
                <Field orientation="horizontal">
                  <Switch id="accept" checked={accepted} onCheckedChange={setAccepted} />
                  <FieldLabel htmlFor="accept">Saya sudah memeriksa dan menerima selisih ini</FieldLabel>
                </Field>
              </>
            ) : (
              <p className="flex items-center gap-2 text-sm">
                <CheckCircle2Icon className="size-4 text-green-600" />
                Semua angka Awal, Masuk, Keluar, Susut dan Saldo Mei–September cocok dengan sheet bulanan.
              </p>
            )}
          </Section>

          {plan.renamed.length > 0 && (
            <Section title="No. TM duplikat (yang pertama tetap, berikutnya diberi akhiran)">
              <List items={plan.renamed.map((r) => `Baris ${r.row}: ${r.from} → ${r.to}`)} />
            </Section>
          )}
          {plan.remapped.length > 0 && (
            <Section title="Kode pemasok yang tidak ada di sheet SUPPLIER, dicocokkan lewat nama">
              <List items={plan.remapped.map((r) => `Baris ${r.row}: ${r.from} → ${r.to} (${r.name})`)} />
            </Section>
          )}
          {plan.dips.length > 0 && (
            <Section title="Stok sempat minus menurut urutan harian (diizinkan khusus impor ini)">
              <List items={plan.dips.map((d) => `${formatDay(d.date)}: ${d.material} ${formatNumber(d.balance)} kg`)} />
            </Section>
          )}

          <div className="flex items-center gap-4">
            <Button onClick={run} disabled={!canRun}>
              Jalankan impor
            </Button>
            {progress && (
              <div className="flex flex-1 items-center gap-3 text-sm">
                <div className="h-2 max-w-sm flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{
                      width: `${(progress.done / progress.total) * 100}%`,
                    }}
                  />
                </div>
                {progress.done < progress.total ? `${progress.done} / ${progress.total} dokumen` : "Menutup buku…"}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function Summary({ summary }: { summary: Record<string, number | string[]> }) {
  return (
    <dl className="grid max-w-2xl grid-cols-2 gap-x-6 gap-y-1 rounded-xl border p-4 text-sm sm:grid-cols-3">
      {Object.entries(SUMMARY_LABELS)
        .filter(([key]) => key in summary)
        .map(([key, label]) => (
          <div key={key}>
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-semibold tabular-nums">{formatNumber(summary[key] as number)}</dd>
          </div>
        ))}
      {Array.isArray(summary.monthsClosed) && (
        <div className="col-span-full">
          <dt className="text-muted-foreground">Tutup buku</dt>
          <dd className="font-semibold">{summary.monthsClosed.join(", ")}</dd>
        </div>
      )}
    </dl>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold">{title}</h2>
      {children}
    </section>
  )
}

const List = ({ items }: { items: string[] }) => (
  <ul className="list-inside list-disc text-sm text-muted-foreground">
    {items.map((item) => (
      <li key={item}>{item}</li>
    ))}
  </ul>
)

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex max-w-2xl items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
      <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-amber-600" />
      <span>{children}</span>
    </p>
  )
}
