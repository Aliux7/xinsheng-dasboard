/**
 * Master data = records stored at `<collection>/{code}`: the code is unique,
 * can't change after saving, and records are deactivated, never deleted.
 * Build their pages with `components/master-page.tsx`.
 */
export type MasterRecord = { id: string; code: string; active: boolean }

export const normalizeCode = (code: string) => code.trim().toUpperCase()

/** Returns an error message, or null when the code is usable as a document id. */
export function checkCode(code: string) {
  if (!code) return "Kode wajib diisi."
  if (!/^[A-Z0-9_-]+$/.test(code)) return "Kode hanya boleh berisi huruf, angka, - dan _."
  return null
}
