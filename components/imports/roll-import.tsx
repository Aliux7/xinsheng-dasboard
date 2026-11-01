"use client"

import { useState } from "react"
import { CheckCircle2Icon, TriangleAlertIcon } from "lucide-react"
import { toast } from "sonner"

import { useAuth, useCanCloseMonth } from "@/components/auth-provider"
import { DataTable } from "@/components/data-table"
import { ImportHeading, ImportTemplate } from "@/components/import-template"
import { Button } from "@/components/ui/button"
import { useCollection } from "@/hooks/use-collection"
import { CLOTH_GRADES, LOOMS, type ClothGrade, type Loom } from "@/lib/collections"
import { ROLL_IMPORT_DOC, ROLL_TEMPLATE, buildRollPlan, runRollImport, type RollPlan } from "@/lib/roll-import"
import { formatDate, formatNumber } from "@/lib/utils"

type Marker = {
  id: string
  status: "running" | "done"
  by: { email: string }
  finishedAt?: never
  summary?: { rolls: number; highest: number; perGrade: RollPlan["perGrade"] }
}

export function RollImport() {
  const allowed = useCanCloseMonth()
  const { roleLoaded } = useAuth()
  const grades = useCollection<ClothGrade>(CLOTH_GRADES).data
  const machines = useCollection<Loom>(LOOMS).data
  const marker = useCollection<Marker>(ROLL_IMPORT_DOC.path).data.find((m) => m.id === ROLL_IMPORT_DOC.id)
  const [plan, setPlan] = useState<RollPlan | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<{
    done: number
    total: number
  } | null>(null)

  if (!roleLoaded) return null
  if (!allowed) {
    return <p className="max-w-2xl text-sm text-muted-foreground">Hanya Developer, Master atau Admin yang dapat menjalankan impor roll loom.</p>
  }

  if (marker?.status === "done" && marker.summary) {
    return (
      <div className="flex max-w-2xl flex-col gap-4">
        <p className="flex items-center gap-2 font-medium">
          <CheckCircle2Icon className="size-5 text-green-600" />
          Impor roll loom sudah dijalankan oleh {marker.by.email}
          {marker.finishedAt && ` pada ${formatDate(marker.finishedAt)}`}: {formatNumber(marker.summary.rolls)} roll, roll baru mulai dari{" "}
          {marker.summary.highest + 1}. Tidak bisa dijalankan lagi.
        </p>
        <PerGrade rows={marker.summary.perGrade} />
      </div>
    )
  }

  const missing = plan ? [...plan.missing.grades, ...plan.missing.machines] : []

  async function load(file: File | undefined) {
    setPlan(null)
    setError(null)
    if (!file) return
    try {
      setPlan(await buildRollPlan(file, { grades, machines }))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function run() {
    if (!plan || !confirm(`Impor ${plan.rolls.length} roll? Ini hanya bisa dilakukan sekali.`)) return
    setError(null)
    setProgress({ done: 0, total: plan.rolls.length })
    try {
      await runRollImport(plan, (done, total) => setProgress({ done, total }))
      toast.success(`Impor selesai: ${plan.rolls.length} roll diimpor.`)
    } catch (err) {
      setError(`${err instanceof Error ? err.message : String(err)} — jalankan lagi untuk melanjutkan.`)
      setProgress(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <ImportHeading title="Impor roll loom">
        Sekali jalan: membaca data roll kain loom. Nomor roll asli tetap dipakai; roll baru melanjutkan setelah nomor tertinggi. Tidak ada yang
        disimpan sebelum Anda menekan Jalankan impor.
      </ImportHeading>
      {marker?.status === "running" && (
        <Notice>Impor sebelumnya berhenti di tengah jalan. Pilih file yang sama lalu jalankan lagi; roll yang sudah masuk dilewati.</Notice>
      )}
      <ImportTemplate sheets={ROLL_TEMPLATE} fileName="template-roll-loom.xlsx" onFile={load} disabled={!!progress} />
      {error && <p className="text-sm text-destructive">{error}</p>}

      {plan && (
        <>
          <p className="text-sm">
            <strong>{formatNumber(plan.rolls.length)}</strong> roll, nomor {Math.min(...plan.rolls.map((r) => r.number))}–{plan.highest}. Roll baru
            berikutnya: <strong>{plan.highest + 1}</strong>.
          </p>
          <PerGrade rows={plan.perGrade} />
          {missing.length > 0 && (
            <Notice>
              Belum ada di Tipe kain & mesin loom, tambahkan dulu:{" "}
              {[
                plan.missing.grades.length && `tipe kain ${plan.missing.grades.join(", ")}`,
                plan.missing.machines.length && `mesin ${plan.missing.machines.join(", ")}`,
              ]
                .filter(Boolean)
                .join("; ")}
              .
            </Notice>
          )}
          {plan.skipped.length > 0 && (
            <Notice>
              {plan.skipped.length} baris dilewati: {plan.skipped.map((s) => `baris ${s.row} (${s.reason})`).join(", ")}
            </Notice>
          )}
          <div className="flex items-center gap-4">
            <Button onClick={run} disabled={!!missing.length || !!progress}>
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
                {progress.done} / {progress.total} roll
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function PerGrade({ rows }: { rows: RollPlan["perGrade"] }) {
  return (
    <div className="max-w-2xl">
      <DataTable
        columns={[
          { header: "Tipe kain", cell: (g) => g.grade },
          {
            header: "Roll",
            cell: (g) => formatNumber(g.rolls),
            className: "text-right tabular-nums",
          },
          {
            header: "Kg",
            cell: (g) => formatNumber(g.kg),
            className: "text-right tabular-nums",
          },
          {
            header: "Meter",
            cell: (g) => formatNumber(g.metres),
            className: "text-right tabular-nums",
          },
          {
            header: "Sudah keluar",
            cell: (g) => formatNumber(g.issued),
            className: "text-right tabular-nums",
          },
        ]}
        data={rows.map((g) => ({ ...g, id: g.grade }))}
        loading={false}
        error={null}
      />
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
