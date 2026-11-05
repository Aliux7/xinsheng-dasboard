import { addRecord, updateRecord } from "@/lib/db"

/**
 * Departments: `departments/{code}` (same shape as the earlier version's, so its data reads again).
 * The code never changes; departments are deactivated, never deleted. Inventory items may name one.
 */
export const DEPARTMENTS = "departments"

export type Department = { id: string; code: string; name: string; active: boolean }

export const DEPARTMENT_CODE = /^[A-Z0-9][A-Z0-9._-]*$/

export const departmentLabel = (d: Pick<Department, "code" | "name">) => (d.name && d.name !== d.code ? `${d.code} · ${d.name}` : d.code)

export function saveDepartment(input: Omit<Department, "id">, isNew: boolean) {
  const code = input.code.trim().toUpperCase()
  if (!DEPARTMENT_CODE.test(code)) throw new Error("Kode hanya boleh huruf, angka, titik, garis bawah dan strip.")
  const data = { ...input, code, name: input.name.trim() }
  return isNew ? addRecord(DEPARTMENTS, data, code) : updateRecord(DEPARTMENTS, code, data)
}
