"use client"

import { Suspense, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeftRightIcon, HistoryIcon, PencilIcon, PlusIcon, UploadIcon } from "lucide-react"
import { toast } from "sonner"

import { DataTable, type Column } from "@/components/data-table"
import { InventoryImport } from "@/components/inventory-import"
import { NumberInput } from "@/components/number-input"
import { SimpleSelect } from "@/components/simple-select"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useCollection } from "@/hooks/use-collection"
import { ACCOUNTS, type Account } from "@/lib/accounts"
import { DEPARTMENTS, departmentLabel, type Department } from "@/lib/departments"
import { INVENTORY_ITEMS, MAX_PER_SAVE, UNITS, addItem, cleanCode, nextCode, round3, saveMovements, updateItem, type InventoryItem } from "@/lib/inventory"
import { cn, formatNumber, today } from "@/lib/utils"

/** "" = every department, "-" = items without one. */
const NO_DEPARTMENT = "-"

export default function InventoryPage() {
  // ?department= needs a Suspense boundary with cacheComponents.
  return (
    <Suspense>
      <Inventory />
    </Suspense>
  )
}

function Inventory() {
  const router = useRouter()
  const department = useSearchParams().get("department") ?? ""
  const items = useCollection<InventoryItem>(INVENTORY_ITEMS, { orderBy: "name" })
  const departments = useCollection<Department>(DEPARTMENTS, { orderBy: "code" })
  const accounts = useCollection<Account>(ACCOUNTS, { orderBy: "code" })
  // Accounts linked to inventory in Daftar akun: where an item's value is kept.
  const stockAccounts = accounts.data.filter((a) => a.link === "inventory")
  const [search, setSearch] = useState("")
  const [showInactive, setShowInactive] = useState(false)
  const [editing, setEditing] = useState<InventoryItem | "new" | null>(null)
  const [moving, setMoving] = useState(false)
  const [importing, setImporting] = useState(false)

  const q = search.trim().toLowerCase()
  const inDepartment = (i: InventoryItem) => !department || (department === NO_DEPARTMENT ? !i.department : i.department === department)
  const shown = items.data
    .filter(
      (i) =>
        (showInactive || i.active) &&
        inDepartment(i) &&
        (!q || [i.code, i.name, i.group, i.unit].some((v) => v?.toLowerCase().includes(q)))
    )
    .sort((a, b) => (a.group || "~").localeCompare(b.group || "~") || (a.code || "~").localeCompare(b.code || "~", undefined, { numeric: true }) || a.name.localeCompare(b.name))
  // The in/out dialog lists the active items of the chosen department.
  const movable = items.data.filter((i) => i.active && inDepartment(i))
  const groups = [...new Set(items.data.map((i) => i.group).filter(Boolean))].sort()
  const departmentName = new Map(departments.data.map((d) => [d.code, departmentLabel(d)]))

  const columns: Column<InventoryItem>[] = [
    { header: "Kode", cell: (i) => (i.code ? <span className="font-medium whitespace-nowrap">{i.code}</span> : <Badge variant="warning">Belum ada</Badge>) },
    { header: "Bahan baku", cell: (i) => <span className="font-medium">{i.name}</span> },
    { header: "Stok", cell: (i) => <span className={cn("font-semibold", i.stock === 0 && "text-muted-foreground")}>{formatNumber(i.stock)}</span>, className: "text-right tabular-nums" },
    { header: "Satuan", cell: (i) => i.unit },
    { header: "Departemen", cell: (i) => (i.department ? departmentName.get(i.department) ?? i.department : <span className="text-muted-foreground">—</span>), className: "hidden md:table-cell" },
    { header: "Status", cell: (i) => !i.active && <Badge variant="outline">Nonaktif</Badge> },
    {
      header: "",
      cell: (i) => (
        <div className="flex justify-end gap-1">
          <Button size="icon-sm" variant="ghost" render={<Link href={`/inventory-movements?item=${i.id}`} />} nativeButton={false} aria-label={`Riwayat ${i.name}`} title="Riwayat stok">
            <HistoryIcon />
          </Button>
          <Button size="icon-sm" variant="ghost" onClick={() => setEditing(i)} aria-label={`Ubah ${i.name}`} title="Ubah">
            <PencilIcon />
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input className="w-full sm:w-72" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari kode, bahan baku, grup…" aria-label="Cari bahan baku" />
        <div className="w-full sm:w-56">
          <SimpleSelect
            id="department"
            value={department}
            onChange={(d) => router.replace(d ? `/inventory?department=${encodeURIComponent(d)}` : "/inventory")}
            options={[
              { value: "", label: "Semua departemen" },
              { value: NO_DEPARTMENT, label: "Tanpa departemen" },
              ...departments.data.map((d) => ({ value: d.code, label: departmentLabel(d) })),
            ]}
            placeholder="Semua departemen"
          />
        </div>
        <Field orientation="horizontal" className="w-auto">
          <Checkbox id="inactive" checked={showInactive} onCheckedChange={setShowInactive} />
          <FieldLabel htmlFor="inactive">Tampilkan nonaktif</FieldLabel>
        </Field>
        <span className="text-sm text-muted-foreground">{shown.length} bahan baku</span>
        <Button variant="outline" className="ml-auto" onClick={() => setImporting(true)} disabled={items.loading}>
          <UploadIcon />
          Import bahan baku
        </Button>
        <Button variant="outline" onClick={() => setMoving(true)} disabled={!movable.length}>
          <ArrowLeftRightIcon />
          Stok masuk / keluar
        </Button>
        <Button onClick={() => setEditing("new")}>
          <PlusIcon />
          Tambah bahan baku
        </Button>
      </div>

      <DataTable
        columns={columns}
        {...items}
        data={shown}
        empty={items.data.length ? "Tidak ada bahan baku yang cocok." : "Belum ada bahan baku. Klik Tambah bahan baku."}
        groupBy={(i) => i.group || "Tanpa grup"}
        rowClassName={(i) => (i.active ? undefined : "text-muted-foreground")}
      />

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          {editing && (
            <ItemForm
              item={editing === "new" ? null : editing}
              items={items.data}
              groups={groups}
              departments={departments.data}
              stockAccounts={stockAccounts}
              defaultDepartment={department === NO_DEPARTMENT ? "" : department}
              onDone={() => setEditing(null)}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={importing} onOpenChange={setImporting}>
        <DialogContent className="sm:max-w-4xl">{importing && <InventoryImport items={items.data} departments={departments.data} stockAccounts={stockAccounts} onDone={() => setImporting(false)} />}</DialogContent>
      </Dialog>
      <Dialog open={moving} onOpenChange={setMoving}>
        <DialogContent className="sm:max-w-4xl">{moving && <BulkMovement items={movable} onDone={() => setMoving(false)} />}</DialogContent>
      </Dialog>
    </div>
  )
}

/** Add (item = null, with an optional opening stock) or edit name / unit / group / active. */
function ItemForm({
  item,
  items,
  groups,
  departments,
  defaultDepartment,
  stockAccounts,
  onDone,
}: {
  item: InventoryItem | null
  items: InventoryItem[]
  groups: string[]
  departments: Department[]
  stockAccounts: Account[]
  defaultDepartment: string
  onDone: () => void
}) {
  const [code, setCode] = useState(() => item?.code ?? nextCode(items.map((i) => i.code)))
  const [name, setName] = useState(item?.name ?? "")
  const [unit, setUnit] = useState(item?.unit ?? "kg")
  const [group, setGroup] = useState(item?.group ?? "")
  const [department, setDepartment] = useState(item ? (item.department ?? "") : defaultDepartment)
  const [active, setActive] = useState(item?.active !== false)
  const [account, setAccount] = useState(item?.account ?? (stockAccounts.length === 1 ? stockAccounts[0].code : ""))
  const [opening, setOpening] = useState<number | null>(null)
  const [openingValue, setOpeningValue] = useState<number | null>(null)
  const [date, setDate] = useState(today)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const n = name.trim()
    const c = cleanCode(code)
    if (items.some((i) => i.id !== item?.id && i.code === c)) return setError(`Kode ${c} sudah dipakai bahan baku lain.`)
    if (items.some((i) => i.id !== item?.id && i.name.trim().toLowerCase() === n.toLowerCase())) return setError(`Bahan baku "${n}" sudah ada.`)
    setError(null)
    setBusy(true)
    try {
      if (item) await updateItem(item.id, { code: c, name: n, unit, group, department, account, active })
      else await addItem({ code: c, name: n, unit, group, department, account }, opening ? { qty: opening, date, value: openingValue ?? undefined } : null)
      toast.success(`Bahan baku ${c} ${n} ${item ? "disimpan" : "ditambahkan"}.`)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
    setBusy(false)
  }

  return (
    <form onSubmit={submit}>
      <DialogHeader>
        <DialogTitle>{item ? `Ubah ${item.name}` : "Tambah bahan baku"}</DialogTitle>
      </DialogHeader>
      <div className="my-6 grid grid-cols-2 gap-4">
        <Field>
          <FieldLabel htmlFor="code">Kode bahan baku</FieldLabel>
          <Input id="code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="BB001" required />
          <FieldDescription>Unik. {item ? "Boleh diubah." : "Diisi otomatis, boleh diganti."}</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="name">Nama bahan baku</FieldLabel>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Benang PP putih" required />
        </Field>
        <Field>
          <FieldLabel htmlFor="unit">Satuan</FieldLabel>
          <Input id="unit" value={unit} onChange={(e) => setUnit(e.target.value)} list="units" placeholder="kg" required />
          <datalist id="units">
            {UNITS.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
        </Field>
        <Field>
          <FieldLabel htmlFor="group">Grup</FieldLabel>
          <Input id="group" value={group} onChange={(e) => setGroup(e.target.value)} list="groups" placeholder="Benang" />
          <datalist id="groups">
            {groups.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
        </Field>
        <Field className="col-span-2">
          <FieldLabel htmlFor="stockAccount">Akun persediaan</FieldLabel>
          <SimpleSelect
            id="stockAccount"
            value={account}
            onChange={setAccount}
            options={[
              { value: "", label: "— Belum dipilih —" },
              ...stockAccounts.map((a) => ({ value: a.code, label: `${a.code} · ${a.nameId}` })),
              ...(account && !stockAccounts.some((a) => a.code === account) ? [{ value: account, label: `${account} · tidak terhubung inventory` }] : []),
            ]}
            placeholder="— Belum dipilih —"
          />
          <FieldDescription>
            {stockAccounts.length
              ? "Akun yang menyimpan nilai bahan baku ini (dipakai HPP bulanan)."
              : "Belum ada akun terhubung inventory. Atur di Daftar akun → Terhubung dengan."}
          </FieldDescription>
        </Field>
        <Field className="col-span-2">
          <FieldLabel htmlFor="dept">Departemen</FieldLabel>
          <SimpleSelect
            id="dept"
            value={department}
            onChange={setDepartment}
            options={[
              { value: "", label: "— Tidak ada —" },
              ...departments.filter((d) => d.active !== false || d.code === department).map((d) => ({ value: d.code, label: departmentLabel(d) })),
            ]}
            placeholder="— Tidak ada —"
          />
        </Field>
        {item ? (
          <>
            <p className="col-span-2 text-sm text-muted-foreground">
              Stok sekarang {formatNumber(item.stock)} {item.unit}. Stok hanya berubah lewat Stok masuk / keluar.
            </p>
            <Field orientation="horizontal" className="col-span-2">
              <Checkbox id="active" checked={active} onCheckedChange={setActive} />
              <FieldLabel htmlFor="active">Aktif</FieldLabel>
            </Field>
          </>
        ) : (
          <>
            <Field>
              <FieldLabel htmlFor="opening">Stok awal</FieldLabel>
              <NumberInput id="opening" value={opening} onChange={setOpening} placeholder="0" />
              <FieldDescription>Boleh kosong; dicatat sebagai pergerakan &quot;Stok awal&quot;.</FieldDescription>
            </Field>
            {!!opening && (
              <>
                <Field>
                  <FieldLabel htmlFor="odate">Tanggal stok awal</FieldLabel>
                  <Input id="odate" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
                </Field>
                <Field className="col-span-2">
                  <FieldLabel htmlFor="ovalue">Nilai stok awal (Rp)</FieldLabel>
                  <NumberInput id="ovalue" value={openingValue} onChange={setOpeningValue} placeholder="0" required />
                  <FieldDescription>Total rupiah stok awal ini; harus ikut di Saldo awal akun persediaannya.</FieldDescription>
                </Field>
              </>
            )}
          </>
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

type Qty = { in: number | null; out: number | null }

/** In and out of many items at once: one date and note, saved together (all or nothing). */
function BulkMovement({ items, onDone }: { items: InventoryItem[]; onDone: () => void }) {
  const [date, setDate] = useState(today)
  const [note, setNote] = useState("")
  const [search, setSearch] = useState("")
  const [qty, setQty] = useState<Record<string, Qty>>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const set = (id: string, patch: Partial<Qty>) => setQty((q) => ({ ...q, [id]: { ...(q[id] ?? { in: null, out: null }), ...patch } }))
  const after = (i: InventoryItem) => round3(i.stock + (qty[i.id]?.in ?? 0) - (qty[i.id]?.out ?? 0))
  const filled = items.filter((i) => qty[i.id]?.in || qty[i.id]?.out)
  const short = filled.filter((i) => after(i) < 0)
  const q = search.trim().toLowerCase()
  // Filled rows stay visible while searching for others.
  const shown = items.filter((i) => !q || qty[i.id]?.in || qty[i.id]?.out || [i.code, i.name, i.group].some((v) => v?.toLowerCase().includes(q)))

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const n = await saveMovements(
        filled.map((i) => ({ item: i.id, in: qty[i.id]?.in ?? 0, out: qty[i.id]?.out ?? 0 })),
        { date, note }
      )
      toast.success(`${n} pergerakan stok disimpan.`)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
    setBusy(false)
  }

  return (
    <form onSubmit={submit} className="flex min-w-0 flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Stok masuk / keluar</DialogTitle>
        <DialogDescription>Isi jumlah masuk dan/atau keluar untuk bahan baku mana saja, lalu simpan sekaligus. Bahan baku yang dikosongkan tidak berubah.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field>
          <FieldLabel htmlFor="mdate">Tanggal</FieldLabel>
          <Input id="mdate" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>
        <Field className="sm:col-span-2">
          <FieldLabel htmlFor="mnote">Keterangan</FieldLabel>
          <Input id="mnote" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Mis. pembelian dari PT ABC / pemakaian produksi" />
        </Field>
      </div>
      <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari kode atau bahan baku…" aria-label="Cari bahan baku" />
      <div className="max-h-[50dvh] overflow-y-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-background">
            <tr className="border-b text-left text-muted-foreground">
              <th className="px-3 py-2 font-medium">Bahan baku</th>
              <th className="px-3 py-2 text-right font-medium">Stok</th>
              <th className="w-36 px-3 py-2 font-medium">Masuk</th>
              <th className="w-36 px-3 py-2 font-medium">Keluar</th>
              <th className="px-3 py-2 text-right font-medium">Stok baru</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((i) => {
              const changed = !!(qty[i.id]?.in || qty[i.id]?.out)
              return (
                <tr key={i.id} className={cn("border-b last:border-0", changed && "bg-brand-soft/40")}>
                  <td className="px-3 py-1.5">
                    <div className="font-medium">
                      {i.code && <span className="text-muted-foreground">{i.code} · </span>}
                      {i.name}
                    </div>
                    {i.group && <div className="text-xs text-muted-foreground">{i.group}</div>}
                  </td>
                  <td className="px-3 py-1.5 text-right whitespace-nowrap tabular-nums">
                    {formatNumber(i.stock)} {i.unit}
                  </td>
                  <td className="px-3 py-1.5">
                    <NumberInput value={qty[i.id]?.in ?? null} onChange={(v) => set(i.id, { in: v })} placeholder="0" aria-label={`Masuk ${i.name}`} />
                  </td>
                  <td className="px-3 py-1.5">
                    <NumberInput value={qty[i.id]?.out ?? null} onChange={(v) => set(i.id, { out: v })} placeholder="0" aria-label={`Keluar ${i.name}`} />
                  </td>
                  <td className={cn("px-3 py-1.5 text-right whitespace-nowrap tabular-nums", changed && "font-semibold", after(i) < 0 && "text-destructive")}>
                    {changed ? `${formatNumber(after(i))} ${i.unit}` : ""}
                  </td>
                </tr>
              )
            })}
            {!shown.length && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                  Tidak ada bahan baku yang cocok.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {short.length > 0 && <FieldError>Stok tidak cukup: {short.map((i) => i.name).join(", ")}.</FieldError>}
      {filled.length > MAX_PER_SAVE && <FieldError>Maksimal {MAX_PER_SAVE} bahan baku sekali simpan.</FieldError>}
      {error && <FieldError>{error}</FieldError>}
      <DialogFooter>
        <span className="mr-auto self-center text-sm text-muted-foreground">{filled.length} bahan baku diisi</span>
        <DialogClose render={<Button variant="outline" type="button" />}>Batal</DialogClose>
        <Button type="submit" disabled={busy || !filled.length || short.length > 0 || filled.length > MAX_PER_SAVE}>
          {busy ? "Menyimpan…" : `Simpan ${filled.length} bahan baku`}
        </Button>
      </DialogFooter>
    </form>
  )
}
