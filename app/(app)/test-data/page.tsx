"use client"

import { useState } from "react"
import { SearchIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { useAuth } from "@/components/auth-provider"
import { Button } from "@/components/ui/button"
import { clearTestData, findTestData, type TestData } from "@/lib/test-data"

const PARTS: [keyof TestData, string][] = [
  ["banks", "Rekening bank (no. rekening UJI-…)"],
  ["rows", "Baris buku bank"],
  ["journals", "Jurnal"],
  ["counters", "Penghitung nomor BBM/BBK"],
  ["items", "Bahan baku (kode UJI-…)"],
  ["movements", "Pergerakan stok"],
  ["departments", "Departemen (kode UJI…)"],
  ["cogs", "Jurnal HPP bulan uji"],
]

/** Lists and deletes the test data (Developer only). */
export default function TestDataPage() {
  const { role } = useAuth()
  const [data, setData] = useState<TestData | null>(null)
  const [busy, setBusy] = useState(false)

  if (role !== "developer") return <p className="text-sm text-muted-foreground">Halaman ini hanya untuk Developer.</p>

  const codes = data ? data.items.filter((i) => i.code).length : 0
  const total = data ? PARTS.reduce((s, [k]) => s + (data[k] as unknown[]).length, 0) + codes + (data.opening ? 1 : 0) : 0

  async function run(action: () => Promise<void>) {
    setBusy(true)
    try {
      await action()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
    setBusy(false)
  }

  const check = () => run(async () => setData(await findTestData()))
  const clear = () =>
    run(async () => {
      if (!data || !confirm(`Hapus ${total} dokumen data uji? Tidak bisa dikembalikan.`)) return
      const n = await clearTestData(data)
      toast.success(`${n} dokumen data uji dihapus.`)
      setData(await findTestData())
    })

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Data uji = semua yang terkait rekening bank dengan no. rekening berawalan <strong>UJI-</strong>, bahan baku dengan kode berawalan{" "}
        <strong>UJI-</strong> dan departemen dengan kode berawalan <strong>UJI</strong>. Daftar akun, baris laporan dan Riwayat perubahan tidak
        dihapus. Jurnal HPP bulan uji dan Saldo awal uji ikut dihapus; Saldo awal asli tidak disentuh. Stok bahan baku asli yang ikut berubah karena jurnal uji
        dikembalikan.
      </p>
      <div className="flex gap-2">
        <Button variant="outline" onClick={check} disabled={busy}>
          <SearchIcon />
          Periksa data uji
        </Button>
        <Button variant="destructive" onClick={clear} disabled={busy || !total}>
          <Trash2Icon />
          Hapus {total || ""} data uji
        </Button>
      </div>
      {data && (
        <ul className="divide-y rounded-xl border text-sm">
          {PARTS.map(([k, label]) => (
            <li key={k} className="flex justify-between px-3 py-2">
              <span>{label}</span>
              <span className="font-medium tabular-nums">{(data[k] as unknown[]).length}</span>
            </li>
          ))}
          <li className="flex justify-between px-3 py-2">
            <span>Kode bahan baku (pemesanan kode)</span>
            <span className="font-medium tabular-nums">{codes}</span>
          </li>
          <li className="flex justify-between px-3 py-2">
            <span>Saldo awal uji</span>
            <span className="font-medium tabular-nums">{data.opening ? 1 : 0}</span>
          </li>
        </ul>
      )}
    </div>
  )
}
