"use client"

import { useState } from "react"
import { PencilIcon, PlusIcon, UploadIcon } from "lucide-react"
import { toast } from "sonner"

import { AccountImport } from "@/components/account-import"
import { DataTable, type Column } from "@/components/data-table"
import { SimpleSelect } from "@/components/simple-select"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useCollection } from "@/hooks/use-collection"
import { ACCOUNTS, ACCOUNT_TYPES, guessType, saveAccount, type Account, type AccountInput, type AccountType, type NormalBalance } from "@/lib/accounts"
import { LINKS, linkOptions } from "@/lib/account-links"
import { REPORT_LINES, statementOf, type ReportLine } from "@/lib/report-lines"

const typeOptions = Object.entries(ACCOUNT_TYPES).map(([value, t]) => ({ value, label: t.label }))
const balanceOptions = [
  { value: "debit", label: "Debit" },
  { value: "credit", label: "Kredit" },
]

export default function AccountsPage() {
  const accounts = useCollection<Account>(ACCOUNTS, { orderBy: "code" })
  const lines = useCollection<ReportLine>(REPORT_LINES, { orderBy: "code" })
  const lineName = new Map(lines.data.map((l) => [l.code, l.name]))
  const [search, setSearch] = useState("")
  const [type, setType] = useState("")
  const [showInactive, setShowInactive] = useState(false)
  const [editing, setEditing] = useState<Account | "new" | null>(null)
  const [importing, setImporting] = useState(false)

  const q = search.trim().toLowerCase()
  const shown = accounts.data.filter(
    (a) =>
      (showInactive || a.active) &&
      (!type || a.type === type) &&
      (!q || [a.code, a.nameId, a.nameEn, a.nameZh, a.group, a.accountGroup ?? "", a.reportLine].some((v) => v?.toLowerCase().includes(q)))
  )

  const columns: Column<Account>[] = [
    { header: "Nomor", cell: (a) => <span className="font-medium tabular-nums">{a.code}</span> },
    {
      header: "Nama",
      cell: (a) => (
        <div className="whitespace-normal">
          <div className="font-medium">{a.nameId}</div>
          <div className="text-xs text-muted-foreground">{[a.nameEn, a.nameZh].filter(Boolean).join(" · ")}</div>
        </div>
      ),
    },
    { header: "Tipe", cell: (a) => (a.type ? ACCOUNT_TYPES[a.type].label : "—"), className: "hidden md:table-cell" },
    { header: "Saldo normal", cell: (a) => (a.normalBalance === "credit" ? "Kredit" : a.normalBalance ? "Debit" : "—"), className: "hidden lg:table-cell" },
    {
      header: "Baris laporan",
      cell: (a) =>
        a.reportLine ? (
          <div className="whitespace-normal">
            <div>
              {a.reportLine} {lineName.get(a.reportLine) && <span>· {lineName.get(a.reportLine)}</span>}
            </div>
            <div className="text-xs text-muted-foreground">{statementOf(a.reportLine)}</div>
          </div>
        ) : (
          a.active && <Badge variant="warning">Belum ada</Badge>
        ),
    },
    {
      header: "Status",
      cell: (a) => (
        <div className="flex gap-1">
          {a.link && <Badge variant="brand">{LINKS[a.link].label}</Badge>}
          {!a.active && <Badge variant="outline">Nonaktif</Badge>}
          {a.needsReview && <Badge variant="warning">Periksa</Badge>}
        </div>
      ),
    },
    {
      header: "",
      cell: (a) => (
        <Button size="icon-sm" variant="ghost" onClick={() => setEditing(a)} aria-label={`Ubah ${a.code}`}>
          <PencilIcon />
        </Button>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input className="w-full sm:w-72" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari nomor, nama, grup…" aria-label="Cari akun" />
        <div className="w-44">
          <SimpleSelect id="type" value={type} onChange={setType} placeholder="Semua tipe" options={[{ value: "", label: "Semua tipe" }, ...typeOptions]} />
        </div>
        <Field orientation="horizontal" className="w-auto">
          <Checkbox id="inactive" checked={showInactive} onCheckedChange={setShowInactive} />
          <FieldLabel htmlFor="inactive">Tampilkan nonaktif</FieldLabel>
        </Field>
        <span className="text-sm text-muted-foreground">{shown.length} akun</span>
        <Button variant="outline" className="ml-auto" onClick={() => setImporting(true)} disabled={accounts.loading}>
          <UploadIcon />
          Import daftar akun
        </Button>
        <Button onClick={() => setEditing("new")}>
          <PlusIcon />
          Tambah akun
        </Button>
      </div>

      <DataTable
        columns={columns}
        {...accounts}
        data={shown}
        empty={accounts.data.length ? "Tidak ada akun yang cocok." : "Belum ada akun."}
        groupBy={(a) => a.group}
        rowClassName={(a) => (a.active ? undefined : "text-muted-foreground")}
      />

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-xl">
          {editing && <AccountForm account={editing === "new" ? null : editing} taken={new Set(accounts.data.map((a) => a.code))} lines={lines.data} onDone={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>
      <Dialog open={importing} onOpenChange={setImporting}>
        <DialogContent className="sm:max-w-5xl">{importing && <AccountImport accounts={accounts.data} onDone={() => setImporting(false)} />}</DialogContent>
      </Dialog>
    </div>
  )
}

const blank: AccountInput = { code: "", nameId: "", nameEn: "", nameZh: "", group: "", accountGroup: "", type: null, normalBalance: null, reportLine: "", link: null, active: true }

/** Add (account = null) or edit; the number is locked once saved. */
function AccountForm({ account, taken, lines, onDone }: { account: Account | null; taken: Set<string>; lines: ReportLine[]; onDone: () => void }) {
  const [form, setForm] = useState<AccountInput>(() =>
    account
      ? {
          code: account.code,
          nameId: account.nameId ?? "",
          nameEn: account.nameEn ?? "",
          nameZh: account.nameZh ?? "",
          group: account.group ?? "",
          accountGroup: account.accountGroup ?? "",
          type: account.type ?? null,
          normalBalance: account.normalBalance ?? null,
          reportLine: account.reportLine ?? "",
          link: account.link ?? null,
          active: account.active !== false,
        }
      : blank
  )
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (patch: Partial<AccountInput>) => setForm((f) => ({ ...f, ...patch }))
  // Balance-sheet types pick NR.. lines, the others LR..; the saved line stays listed even if it no longer fits.
  const prefix = !form.type ? "" : ["asset", "liability", "equity"].includes(form.type) ? "NR" : "LR"
  const lineOptions = [
    { value: "", label: "— Tidak ada —" },
    ...lines
      .filter((l) => l.code === form.reportLine || (l.active && l.code.startsWith(prefix)))
      .map((l) => ({ value: l.code, label: `${l.code} · ${l.name || "Belum diberi nama"}` })),
    ...(form.reportLine && !lines.some((l) => l.code === form.reportLine) ? [{ value: form.reportLine, label: `${form.reportLine} · tidak ada di Baris laporan` }] : []),
  ]

  // A new number suggests its type (and so its normal balance) until one is chosen.
  function setCode(code: string) {
    const digits = code.replace(/\D/g, "").slice(0, 6)
    const guess = !form.type && digits.length === 6 ? guessType(digits) : null
    set({ code: digits, ...(guess && { type: guess, normalBalance: ACCOUNT_TYPES[guess].balance }) })
  }

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!account && taken.has(form.code)) return setError(`Nomor akun ${form.code} sudah ada.`)
    setError(null)
    setBusy(true)
    try {
      await saveAccount({ ...form, nameId: form.nameId.trim(), nameEn: form.nameEn.trim(), nameZh: form.nameZh.trim(), group: form.group.trim() }, !account)
      toast.success(`Akun ${form.code} ${form.nameId.trim()} ${account ? "disimpan" : "ditambahkan"}.`)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
    setBusy(false)
  }

  return (
    <form onSubmit={submit}>
      <DialogHeader>
        <DialogTitle>{account ? `Ubah akun ${account.code}` : "Tambah akun"}</DialogTitle>
      </DialogHeader>
      <div className="my-6 grid grid-cols-2 gap-4">
        <Field>
          <FieldLabel htmlFor="code">Nomor akun</FieldLabel>
          <Input id="code" value={form.code} onChange={(e) => setCode(e.target.value)} placeholder="110101" inputMode="numeric" disabled={!!account} required />
          {!account && <FieldDescription>6 digit, tidak bisa diubah setelah disimpan.</FieldDescription>}
        </Field>
        <Field>
          <FieldLabel htmlFor="nameId">Nama (Indonesia)</FieldLabel>
          <Input id="nameId" value={form.nameId} onChange={(e) => set({ nameId: e.target.value })} placeholder="Kas" required />
        </Field>
        <Field>
          <FieldLabel htmlFor="nameEn">Nama (Inggris)</FieldLabel>
          <Input id="nameEn" value={form.nameEn} onChange={(e) => set({ nameEn: e.target.value })} placeholder="Cash" />
        </Field>
        <Field>
          <FieldLabel htmlFor="nameZh">Nama (Mandarin)</FieldLabel>
          <Input id="nameZh" value={form.nameZh} onChange={(e) => set({ nameZh: e.target.value })} placeholder="现金" />
        </Field>
        <Field>
          <FieldLabel htmlFor="group">Judul grup</FieldLabel>
          <Input id="group" value={form.group} onChange={(e) => set({ group: e.target.value })} placeholder="Kas & Bank" required />
        </Field>
        <Field>
          <FieldLabel htmlFor="accountGroup">Grup akun (Excel)</FieldLabel>
          <Input id="accountGroup" value={form.accountGroup ?? ""} onChange={(e) => set({ accountGroup: e.target.value })} placeholder="Cash/Bank" />
        </Field>
        <Field>
          <FieldLabel htmlFor="atype">Tipe</FieldLabel>
          <SimpleSelect
            id="atype"
            value={form.type ?? ""}
            // The normal balance follows the type; it can still be changed.
            onChange={(v) =>
              set({
                type: v as AccountType,
                normalBalance: ACCOUNT_TYPES[v as AccountType].balance,
                // A link the new type can't have is dropped.
                ...(form.link && !LINKS[form.link].types.includes(v as AccountType) && { link: null }),
              })
            }
            options={typeOptions}
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="balance">Saldo normal</FieldLabel>
          <SimpleSelect id="balance" value={form.normalBalance ?? ""} onChange={(v) => set({ normalBalance: v as NormalBalance })} options={balanceOptions} required />
        </Field>
        <Field>
          <FieldLabel htmlFor="reportLine">Baris laporan</FieldLabel>
          <SimpleSelect id="reportLine" value={form.reportLine} onChange={(reportLine) => set({ reportLine })} options={lineOptions} placeholder="— Tidak ada —" />
          <FieldDescription>Boleh kosong. Daftarnya diatur di halaman Baris laporan.</FieldDescription>
        </Field>
        <Field className="col-span-2">
          <FieldLabel htmlFor="link">Terhubung dengan</FieldLabel>
          <SimpleSelect
            id="link"
            value={form.link ?? ""}
            onChange={(v) => set({ link: (v || null) as AccountInput["link"] })}
            options={[{ value: "", label: "— Tidak terhubung —" }, ...linkOptions(form.type)]}
            placeholder="— Tidak terhubung —"
          />
          {form.link ? (
            <ul className="list-inside list-disc rounded-lg bg-brand-soft/50 px-3 py-2 text-xs text-brand">
              {LINKS[form.link].rules.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          ) : (
            <FieldDescription>
              Opsional. Akun yang terhubung meminta data tambahan saat dijurnal. Pilihan yang tersedia tergantung tipe akun (Inventory: akun Aset).
            </FieldDescription>
          )}
        </Field>
        {account && (
          <Field orientation="horizontal" className="self-center">
            <Checkbox id="active" checked={form.active} onCheckedChange={(active) => set({ active })} />
            <FieldLabel htmlFor="active">Aktif</FieldLabel>
          </Field>
        )}
        {error && <FieldError className="col-span-2">{error}</FieldError>}
      </div>
      <DialogFooter>
        <DialogClose render={<Button variant="outline" type="button" />}>Batal</DialogClose>
        <Button type="submit" disabled={busy}>
          {busy ? "Menyimpan…" : "Simpan"}
        </Button>
      </DialogFooter>
    </form>
  )
}
