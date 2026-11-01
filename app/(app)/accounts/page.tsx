"use client"

import { MasterPage } from "@/components/master-page"
import { SimpleSelect } from "@/components/simple-select"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useCollection } from "@/hooks/use-collection"
import { ACCOUNT_TYPES, EXCEL_GROUPS, groupKey, guessMissing, isAccountNumber } from "@/lib/accounting"
import { ACCOUNTS, REPORT_LINES, type Account, type AccountType, type ReportLine } from "@/lib/collections"
import { addRecord } from "@/lib/db"

type Fields = Omit<Account, "id">

const empty: Fields = {
  code: "",
  nameId: "",
  nameEn: "",
  nameZh: "",
  group: "",
  accountGroup: "",
  type: null,
  normalBalance: null,
  reportLine: "",
  needsReview: false,
  active: true,
}

const typeOptions = Object.entries(ACCOUNT_TYPES).map(([value, t]) => ({ value, label: t.label }))
const balanceOptions = [
  { value: "debit", label: "Debit" },
  { value: "credit", label: "Kredit" },
]

/** Website type by key or label ("asset" / "Aset"), ignoring case and extra spaces. */
const websiteType = (text: string) =>
  Object.entries(ACCOUNT_TYPES).find(([key, t]) => [key, t.label].some((v) => groupKey(v) === groupKey(text)))?.[0] as AccountType | undefined

const EXCEL_GROUP_NAMES = "Cash/Bank, Account Receivable, Other Current Asset, Inventory, Fixed Asset, Accumulated Depreciation, Account Payable, Other Current Liability, Long Term Liability, Equity, Revenue, Cost of Goods Sold, Expense, Other Income, Other Expense"
const TYPE_NAMES = Object.values(ACCOUNT_TYPES).map((t) => t.label).join(", ")
const BALANCE_SHEET_TYPES: AccountType[] = ["asset", "liability", "equity"]

/** "Debit" / "Kredit" (or "credit") → normal balance; null when unknown. */
const balanceOf = (text: string) => ({ debit: "debit", kredit: "credit", credit: "credit" } as const)[text.toLowerCase() as "debit"] ?? null

/** Keeps only non-blank values, so an import never wipes a field the sheet leaves empty. */
const filled = (values: Partial<Fields>) =>
  Object.fromEntries(Object.entries(values).filter(([, v]) => v !== "")) as Partial<Fields>

export default function AccountsPage() {
  const lines = useCollection<ReportLine>(REPORT_LINES, { orderBy: "code" }).data
  const lineName = (code: string) => lines.find((l) => l.code === code)?.name

  return (
    <MasterPage<Account>
      path={ACCOUNTS}
      noun="akun"
      empty={empty}
      codePlaceholder="110101"
      codeLabel="Nomor akun"
      validateCode={(code) => (isAccountNumber(code) ? null : "Nomor akun harus tepat 6 digit.")}
      // Saving in the form counts as reviewing any guessed values.
      prepare={(data) => ({ ...data, needsReview: false })}
      groupBy={(a) => a.group}
      filters={[{ label: "grup akun", value: (a) => a.accountGroup ?? "" }]}
      searchText={(a) => [a.nameId, a.nameEn, a.nameZh, a.accountGroup ?? ""]}
      columns={[
        {
          header: "Nama",
          cell: (a) => (
            <div className="whitespace-normal">
              <div className="font-medium">{a.nameId}</div>
              <div className="text-xs text-muted-foreground">{[a.nameEn, a.nameZh].filter(Boolean).join(" · ")}</div>
            </div>
          ),
        },
        { header: "Grup akun", cell: (a) => a.accountGroup || "—", className: "hidden md:table-cell" },
        { header: "Tipe", cell: (a) => (a.type ? ACCOUNT_TYPES[a.type].label : "—"), className: "hidden md:table-cell" },
        { header: "Saldo normal", cell: (a) => (a.normalBalance === "credit" ? "Kredit" : a.normalBalance ? "Debit" : "—"), className: "hidden md:table-cell" },
        {
          header: "Baris laporan",
          cell: (a) => (
            <span className="whitespace-normal">
              {a.reportLine ? `${a.reportLine} ${lineName(a.reportLine) ?? ""}` : a.active && <span className="text-amber-600">Belum ada</span>}
              {a.needsReview && <span className="ml-2 text-xs text-amber-600">Periksa</span>}
            </span>
          ),
        },
      ]}
      fields={(form, set) => (
        <>
          <Field>
            <FieldLabel htmlFor="nameId">Nama (Indonesia)</FieldLabel>
            <Input id="nameId" value={form.nameId} onChange={(e) => set({ nameId: e.target.value })} placeholder="Kas" required />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel htmlFor="nameEn">Nama (Inggris)</FieldLabel>
              <Input id="nameEn" value={form.nameEn} onChange={(e) => set({ nameEn: e.target.value })} placeholder="Cash" />
            </Field>
            <Field>
              <FieldLabel htmlFor="nameZh">Nama (Mandarin)</FieldLabel>
              <Input id="nameZh" value={form.nameZh} onChange={(e) => set({ nameZh: e.target.value })} placeholder="现金" />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="group">Judul grup</FieldLabel>
            <Input id="group" value={form.group} onChange={(e) => set({ group: e.target.value })} placeholder="Kas & Bank" required />
          </Field>
          <Field>
            <FieldLabel htmlFor="accountGroup">Grup akun</FieldLabel>
            <Input id="accountGroup" value={form.accountGroup ?? ""} onChange={(e) => set({ accountGroup: e.target.value })} placeholder="Cash/Bank" />
            <FieldDescription>Grup asli dari Excel, mis. Cash/Bank, Fixed Asset, Cost of Goods Sold.</FieldDescription>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel htmlFor="type">Tipe</FieldLabel>
              <SimpleSelect
                id="type"
                value={form.type ?? ""}
                // The normal balance follows from the type; it can still be changed.
                onChange={(v) => set({ type: v as AccountType, normalBalance: ACCOUNT_TYPES[v as AccountType].balance })}
                options={typeOptions}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="normalBalance">Saldo normal</FieldLabel>
              <SimpleSelect
                id="normalBalance"
                value={form.normalBalance ?? ""}
                onChange={(v) => set({ normalBalance: v as "debit" | "credit" })}
                options={balanceOptions}
                required
              />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="reportLine">Baris laporan</FieldLabel>
            <SimpleSelect
              id="reportLine"
              value={form.reportLine}
              onChange={(reportLine) => set({ reportLine })}
              options={lines
                .filter((l) => l.active || l.code === form.reportLine)
                .map((l) => ({ value: l.code, label: `${l.code} · ${l.name}` }))}
              placeholder="Pilih baris neraca atau laba rugi"
              required={form.active}
            />
            <FieldDescription>Wajib diisi selama akun aktif. Kelola daftarnya di Baris laporan.</FieldDescription>
          </Field>
        </>
      )}
      importers={[
        {
          title: "Impor akun",
          description: "Tambah atau perbarui akun dengan kolom yang sama seperti form akun; nomor yang sudah ada diperbarui, sel kosong tidak menghapus isi.",
          sheet: "AKUN",
          fromRow: 2,
          columns: [
            { col: "A", header: "Nomor akun", required: true, example: "110101" },
            { col: "B", header: "Nama (Indonesia)", required: true, example: "Kas" },
            { col: "C", header: "Nama (Inggris)", example: "Cash" },
            { col: "D", header: "Nama (Mandarin)", example: "现金" },
            { col: "E", header: "Judul grup", required: true, example: "Kas & Bank" },
            { col: "F", header: "Tipe", example: "Cash/Bank" },
            { col: "G", header: "Saldo normal", example: "Debit" },
            { col: "H", header: "Baris laporan", example: "NR01" },
          ],
          note: `Tipe: tipe website (${TYPE_NAMES}) atau grup Excel (${EXCEL_GROUP_NAMES}); grup Excel disimpan sebagai Grup akun. Saldo normal: Debit atau Kredit (kosong = mengikuti tipe). Tipe atau baris laporan yang kosong ditebak dari nomor akun dan ditandai Periksa.`,
          parse: ([num = "", nameId = "", nameEn = "", nameZh = "", group = "", typeText = "", balanceText = "", line = ""], current) => {
            if (!isAccountNumber(num)) return num ? `"${num}" bukan nomor akun 6 digit.` : "Nomor akun kosong."
            if (!current && !nameId) return "Nama (Indonesia) kosong."
            if (!current && !group) return "Judul grup kosong."
            // Tipe holds either an Excel group (kept as Grup akun and mapped to a type) or a website type.
            // Excel groups win, since "Equity", "Revenue" and "Expense" are also website type keys.
            const excelType = typeText ? EXCEL_GROUPS[groupKey(typeText)] : undefined
            let type = excelType ?? websiteType(typeText)
            if (typeText && !type) return `Tipe "${typeText}" tidak dikenal. Isi tipe website (${TYPE_NAMES}) atau grup Excel (${EXCEL_GROUP_NAMES}).`
            const balance = balanceText ? balanceOf(balanceText) : undefined
            if (balance === null) return `Saldo normal "${balanceText}" harus Debit atau Kredit.`
            const reportLine = line.toUpperCase()
            const { guess, note } = guessMissing(num, current, lines, { type, reportLine })
            // A profit & loss line can't hold a balance-sheet type: e.g. 910003 Unrealize Gain (Loss) Forex, group Equity, line LR74.
            const notes = [note]
            const finalLine = reportLine || current?.reportLine || guess.reportLine || ""
            if (excelType && BALANCE_SHEET_TYPES.includes(excelType) && finalLine.startsWith("LR")) {
              type = "otherExpense"
              notes.push(`grup ${typeText} di baris laba rugi ${finalLine} → ${ACCOUNT_TYPES.otherExpense.label}`)
            }
            const normalBalance = balance ?? (type ? ACCOUNT_TYPES[type].balance : undefined)
            const given = { ...(type && { type }), ...(normalBalance && { normalBalance }) }
            const accountGroup = excelType ? typeText : ""
            return {
              code: num,
              data: { ...filled({ nameId, nameEn, nameZh, group, accountGroup, reportLine }), ...given, ...guess },
              note: notes.filter(Boolean).join("; "),
            }
          },
          // Report-line codes the sheet uses but the list doesn't have yet; name them under Baris laporan.
          beforeSave: async (rows) => {
            const known = new Set(lines.map((l) => l.code))
            const missing = [...new Set(rows.map((r) => r.data.reportLine).filter((c): c is string => !!c && !known.has(c)))]
            await Promise.all(missing.map((code) => addRecord(REPORT_LINES, { code, name: code, prefixes: "", active: true }, code)))
          },
          defaults: empty,
        },
      ]}
    />
  )
}
