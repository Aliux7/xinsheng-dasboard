"use client"

import { useState } from "react"
import { toast } from "sonner"

import { useIsAdmin } from "@/components/auth-provider"
import { AccountSelect } from "@/components/account-select"
import { MasterPage } from "@/components/master-page"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { useCollection } from "@/hooks/use-collection"
import { useBanks } from "@/hooks/use-banks"
import { useCompany } from "@/hooks/use-company"
import {
  ACCOUNTS,
  BANKS,
  COMPANY_SETTINGS,
  RECEIVING_ACCOUNTS,
  SETTINGS,
  type Account,
  type Bank,
  type CompanySettings,
  type ReceivingAccount,
} from "@/lib/collections"
import { transaction } from "@/lib/db"

const blankCompany: CompanySettings = { name: "", address: "", phone: "", email: "", taxNumber: "", noLetterhead: false }

const blankAccount: Omit<ReceivingAccount, "id"> = { code: "", bank: "", accountNo: "", holder: "", branch: "", active: true }

const blankBank: Omit<Bank, "id"> = { code: "", name: "", account: "", active: true }

export default function SettingsPage() {
  const { company, loading } = useCompany()
  return (
    <div className="flex flex-col gap-8">
      {/* Remount once loaded so the form starts from the saved values. */}
      {!loading && <LetterheadForm key={company ? "saved" : "new"} saved={company} />}
      <BankSection />
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="font-semibold">Rekening penerima</h2>
          <p className="text-sm text-muted-foreground">Dipilih di faktur penjualan dan dicetak di bagian pembayaran.</p>
        </div>
        <MasterPage<ReceivingAccount>
          path={RECEIVING_ACCOUNTS}
          noun="rekening"
          empty={blankAccount}
          autoCode="REK"
          searchText={(a) => [a.bank, a.accountNo, a.holder, a.branch]}
          columns={[
            { header: "Bank", cell: (a) => a.bank },
            { header: "No. rekening", cell: (a) => a.accountNo },
            { header: "Atas nama", cell: (a) => a.holder },
            { header: "Cabang / kota", cell: (a) => a.branch || "—", className: "hidden md:table-cell" },
          ]}
          fields={(form, set) => (
            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="bank">Bank</FieldLabel>
                <Input id="bank" value={form.bank} onChange={(e) => set({ bank: e.target.value })} placeholder="BCA" required />
              </Field>
              <Field>
                <FieldLabel htmlFor="accountNo">No. rekening</FieldLabel>
                <Input id="accountNo" value={form.accountNo} onChange={(e) => set({ accountNo: e.target.value })} required />
              </Field>
              <Field>
                <FieldLabel htmlFor="holder">Atas nama</FieldLabel>
                <Input id="holder" value={form.holder} onChange={(e) => set({ holder: e.target.value })} required />
              </Field>
              <Field>
                <FieldLabel htmlFor="branch">Cabang / kota</FieldLabel>
                <Input id="branch" value={form.branch} onChange={(e) => set({ branch: e.target.value })} placeholder="KEDIRI" />
              </Field>
            </div>
          )}
        />
      </section>
    </div>
  )
}

/** Own bank accounts for the Buku bank, payments and receipts; the code is the journal source and never changes. */
function BankSection() {
  const accounts = useCollection<Account>(ACCOUNTS).data
  const { unsaved } = useBanks()
  const [seeding, setSeeding] = useState(false)

  // Built-in banks (DEFAULT_BANKS) are used until saved; saving them makes them editable here.
  async function seed() {
    setSeeding(true)
    try {
      await transaction(async (w) => {
        for (const { id, ...b } of unsaved) await w.set(BANKS, id, b)
      })
      toast.success(`Bank bawaan disimpan: ${unsaved.map((b) => b.name).join(", ")}.`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
    setSeeding(false)
  }

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="font-semibold">Bank</h2>
        <p className="text-sm text-muted-foreground">
          Rekening bank perusahaan untuk Buku bank, pembayaran pemasok, penerimaan pelanggan dan pajak impor. Kode dipakai di nomor jurnal dan tidak dapat diubah; bank yang tidak dipakai lagi dinonaktifkan.
        </p>
      </div>
      <MasterPage<Bank>
        path={BANKS}
        noun="bank"
        empty={blankBank}
        codePlaceholder="BCA4"
        searchText={(b) => [b.name, b.account]}
        columns={[
          { header: "Nama", cell: (b) => b.name },
          { header: "Akun", cell: (b) => `${b.account} ${accounts.find((a) => a.code === b.account)?.nameId ?? ""}` },
        ]}
        toolbar={() =>
          unsaved.length > 0 && (
            <Button variant="outline" onClick={seed} disabled={seeding} title={unsaved.map((b) => b.name).join(", ")}>
              {seeding ? "Menyimpan…" : `Simpan bank bawaan (${unsaved.length})`}
            </Button>
          )
        }
        fields={(form, set) => (
          <div className="grid gap-4">
            <Field>
              <FieldLabel htmlFor="bank-name">Nama</FieldLabel>
              <Input id="bank-name" value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="BCA PT 3" required />
            </Field>
            <Field>
              <FieldLabel htmlFor="bank-account">Akun (Daftar akun)</FieldLabel>
              <AccountSelect id="bank-account" value={form.account} onChange={(account) => set({ account })} accounts={accounts} required />
            </Field>
          </div>
        )}
      />
    </section>
  )
}

/** Letterhead printed on delivery notes and invoices; Admin (and Master/Developer) can change it. */
function LetterheadForm({ saved }: { saved: CompanySettings | null }) {
  const isAdmin = useIsAdmin()
  const [form, setForm] = useState<CompanySettings>({ ...blankCompany, ...saved })
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const set = (patch: Partial<CompanySettings>) => setForm((f) => ({ ...f, ...patch }))

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSaving(true)
    try {
      const data: CompanySettings = {
        name: form.name.trim(),
        address: form.address.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        taxNumber: form.taxNumber.trim(),
        noLetterhead: form.noLetterhead,
      }
      await transaction((w) => w.set(SETTINGS, COMPANY_SETTINGS, data))
      toast.success("Kop surat disimpan.")
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
    setSaving(false)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Kop surat</CardTitle>
        <CardDescription>Dicetak di atas surat jalan dan faktur penjualan (PDF dan Excel).{!isAdmin && " Hanya Admin yang dapat mengubah."}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit}>
          <fieldset disabled={!isAdmin}>
            <FieldGroup>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field className="sm:col-span-2">
                  <FieldLabel htmlFor="company-name">Nama perusahaan</FieldLabel>
                  <Input id="company-name" value={form.name} onChange={(e) => set({ name: e.target.value })} required />
                </Field>
                <Field className="sm:col-span-2">
                  <FieldLabel htmlFor="company-address">Alamat</FieldLabel>
                  <Textarea id="company-address" value={form.address} onChange={(e) => set({ address: e.target.value })} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="company-phone">Telepon</FieldLabel>
                  <Input id="company-phone" type="tel" value={form.phone} onChange={(e) => set({ phone: e.target.value })} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="company-email">Email</FieldLabel>
                  <Input id="company-email" type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="company-tax">NPWP</FieldLabel>
                  <Input id="company-tax" value={form.taxNumber} onChange={(e) => set({ taxNumber: e.target.value })} />
                </Field>
              </div>
              <Field orientation="horizontal">
                <Switch id="noLetterhead" checked={form.noLetterhead} onCheckedChange={(noLetterhead) => set({ noLetterhead })} disabled={!isAdmin} />
                <FieldLabel htmlFor="noLetterhead">Cetak tanpa kop surat</FieldLabel>
              </Field>
              <FieldDescription className="-mt-3">Untuk kertas yang kop suratnya sudah tercetak.</FieldDescription>
              {error && <FieldError>{error}</FieldError>}
              {isAdmin && (
                <Button type="submit" className="w-fit" disabled={saving}>
                  {saving ? "Menyimpan…" : "Simpan kop surat"}
                </Button>
              )}
            </FieldGroup>
          </fieldset>
        </form>
      </CardContent>
    </Card>
  )
}
