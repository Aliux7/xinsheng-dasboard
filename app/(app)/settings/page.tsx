"use client"

import { useState } from "react"
import { toast } from "sonner"

import { useIsAdmin } from "@/components/auth-provider"
import { MasterPage } from "@/components/master-page"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { useCompany } from "@/hooks/use-company"
import { COMPANY_SETTINGS, RECEIVING_ACCOUNTS, SETTINGS, type CompanySettings, type ReceivingAccount } from "@/lib/collections"
import { transaction } from "@/lib/db"

const blankCompany: CompanySettings = { name: "", address: "", phone: "", email: "", taxNumber: "", noLetterhead: false }

const blankAccount: Omit<ReceivingAccount, "id"> = { code: "", bank: "", accountNo: "", holder: "", branch: "", active: true }

export default function SettingsPage() {
  const { company, loading } = useCompany()
  return (
    <div className="flex flex-col gap-8">
      {/* Remount once loaded so the form starts from the saved values. */}
      {!loading && <LetterheadForm key={company ? "saved" : "new"} saved={company} />}
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
