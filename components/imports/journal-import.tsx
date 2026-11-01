"use client"

import { useState } from "react"
import { CheckCircle2Icon, TriangleAlertIcon } from "lucide-react"
import { toast } from "sonner"

import { useAuth, useCanCloseMonth } from "@/components/auth-provider"
import { ImportHeading, ImportTemplate } from "@/components/import-template"
import { Button } from "@/components/ui/button"
import { useCollection } from "@/hooks/use-collection"
import { ACCOUNTS, JOURNAL_SOURCES, type Account } from "@/lib/collections"
import { CLOSE_MONTHS, JOURNAL_IMPORT_DOC, JOURNAL_TEMPLATE, buildJournalPlan, runJournalImport, type JournalPlan } from "@/lib/journal-import"
import { formatDate, formatNumber } from "@/lib/utils"

type Marker = {
  id: string
  status: "running" | "done"
  by: { email: string }
  finishedAt?: never
  summary?: {
    entries: number
    lines: number
    totalDebit: number
    unbalanced: string[]
  }
}

export function JournalImport() {
  const allowed = useCanCloseMonth()
  const { roleLoaded } = useAuth()
  const accounts = useCollection<Account>(ACCOUNTS).data
  const marker = useCollection<Marker>(JOURNAL_IMPORT_DOC.path).data.find((m) => m.id === JOURNAL_IMPORT_DOC.id)
  const [plan, setPlan] = useState<JournalPlan | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<{
    done: number
    total: number
  } | null>(null)

  if (!roleLoaded) return null
  if (!allowed)
    return <p className="max-w-2xl text-sm text-muted-foreground">Hanya Developer, Master atau Admin yang dapat menjalankan impor jurnal 2025.</p>

  if (marker?.status === "done" && marker.summary) {
    const s = marker.summary
    return (
      <p className="flex max-w-2xl items-start gap-2 font-medium">
        <CheckCircle2Icon className="mt-0.5 size-5 shrink-0 text-green-600" />
        Impor jurnal 2025 sudah dijalankan oleh {marker.by.email}
        {marker.finishedAt && ` pada ${formatDate(marker.finishedAt)}`}: {formatNumber(s.entries)} jurnal, {formatNumber(s.lines)} baris, total{" "}
        {formatNumber(s.totalDebit)}. Ditandai tidak seimbang: {s.unbalanced.join(", ") || "tidak ada"}. Tidak bisa dijalankan lagi.
      </p>
    )
  }

  const blocked = plan ? plan.missingAccounts.length > 0 || plan.unknownSources.length > 0 : true

  async function load(file: File | undefined) {
    setPlan(null)
    setError(null)
    if (!file) return
    try {
      setPlan(await buildJournalPlan(file, accounts))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function run() {
    if (!plan || !confirm(`Impor ${plan.entries.length} jurnal dan tutup periode ${CLOSE_MONTHS.join(", ")}? Ini hanya bisa dilakukan sekali.`))
      return
    setError(null)
    setProgress({ done: 0, total: plan.entries.length })
    try {
      await runJournalImport(plan, (done, total) => setProgress({ done, total }))
      toast.success(`Impor selesai: ${plan.entries.length} jurnal diimpor.`)
    } catch (err) {
      setError(`${err instanceof Error ? err.message : String(err)} — jalankan lagi untuk melanjutkan.`)
      setProgress(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <ImportHeading title="Impor jurnal 2025">
        Sekali jalan: membaca jurnal 2025 dari laporan keuangan, lalu menutup periode September–Desember 2025. Tidak ada yang disimpan sebelum Anda
        menekan Jalankan impor.
      </ImportHeading>
      {marker?.status === "running" && (
        <Notice>Impor sebelumnya berhenti di tengah jalan. Pilih file yang sama lalu jalankan lagi; jurnal yang sudah masuk dilewati.</Notice>
      )}
      <ImportTemplate sheets={JOURNAL_TEMPLATE} fileName="template-jurnal-2025.xlsx" onFile={load} disabled={!!progress} />
      {error && <p className="text-sm text-destructive">{error}</p>}

      {plan && (
        <>
          <dl className="grid max-w-2xl grid-cols-2 gap-x-6 gap-y-1 rounded-xl border p-4 text-sm sm:grid-cols-3">
            {[
              ["Jurnal", formatNumber(plan.entries.length)],
              ["Baris", formatNumber(plan.lines)],
              ["Baris 0 dilewati", formatNumber(plan.skippedZero)],
              ["Total debit", formatNumber(plan.totalDebit)],
              ["Total kredit", formatNumber(plan.totalCredit)],
              ["Selisih", formatNumber(plan.totalDebit - plan.totalCredit)],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="font-semibold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          {plan.missingAccounts.length > 0 && <Notice>Akun belum ada di Daftar akun, tambahkan dulu: {plan.missingAccounts.join(", ")}.</Notice>}
          {plan.unknownSources.length > 0 && <Notice>Sumber tidak dikenal: {plan.unknownSources.join(", ")}.</Notice>}
          {plan.missingAccounts.length === 0 && (
            <p className="flex items-center gap-2 text-sm">
              <CheckCircle2Icon className="size-4 text-green-600" /> Semua akun ada di Daftar akun.
            </p>
          )}
          {plan.unbalanced.length > 0 && (
            <section className="flex flex-col gap-1 text-sm">
              <h2 className="font-semibold">Jurnal tidak seimbang (diimpor dengan tanda)</h2>
              <ul className="list-inside list-disc text-muted-foreground">
                {plan.unbalanced.map((u) => (
                  <li key={u.number}>
                    {u.number} ({JOURNAL_SOURCES[u.source as keyof typeof JOURNAL_SOURCES] ?? u.source}
                    ): selisih {formatNumber(u.difference)}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {plan.combined.length > 0 && (
            <section className="flex flex-col gap-1 text-sm">
              <h2 className="font-semibold">Baris tanpa nomor dokumen, digabung menjadi satu jurnal transfer</h2>
              <ul className="list-inside list-disc text-muted-foreground">
                {plan.combined.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </section>
          )}
          <div className="flex items-center gap-4">
            <Button onClick={run} disabled={blocked || !!progress}>
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
                {progress.done < progress.total ? `${progress.done} / ${progress.total} jurnal` : "Menutup periode…"}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex max-w-2xl items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
      <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-amber-600" />
      <span>{children}</span>
    </p>
  )
}
