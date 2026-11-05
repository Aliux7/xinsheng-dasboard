<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project conventions

The app is cut back to its foundation (auth, users/roles, change logs). The removed business features
(warehouse, loom, purchasing, sales, tax, accounting, bank book…) are documented in `docs/FEATURES.md`;
their code is in git commit `adfcd6e`.

- **Client-only Firebase, no backend.** `lib/firebase.ts` exports `auth` and `db`. There is no server code, firebase-admin or API route. The only server-side piece is `proxy.ts`: it redirects to /login when the "signed in" cookie (`lib/auth-cookie.ts`, set by `AuthProvider`) is missing; it is a hint, not security.
- **Auth:** `useAuth()` from `components/auth-provider.tsx`. Pages under `app/(app)/` are protected by `app/(app)/layout.tsx`. Each login user has a `users/{uid}` profile, created on first login.
- **Roles:** `users/{uid}.role` = `developer` > `master` > `admin` > Staff (empty). **Master and Developer are allowed in every feature.** Roles are changed on the Pengguna page by Master/Developer only, for users ranked below them and only to a role below theirs (so a Developer can never be changed, a Master only by a Developer); `roleRank()` in `components/auth-provider.tsx` and `rank()` in `firestore.rules` must match. The first Developer is set in the Firebase console. Use `useIsAdmin()` / `useCanManageRoles()` (they already include Master/Developer) and the matching `isAdmin()` / `isSuper()` in `firestore.rules`. Any new role-gated feature must allow Master and Developer too.
- **Every write goes through `lib/db.ts`** (`addRecord` / `updateRecord` / `deleteRecord`), never Firestore's `setDoc`/`updateDoc`/`deleteDoc` directly. They write the change and its `logs` entry in one transaction, which is what the Riwayat perubahan page shows. Documents that change together: `transaction(async (w) => …)`; all-or-nothing and still logged.
- **Reading data:** `useCollection(path, { orderBy, desc, limit })` from `hooks/use-collection.ts` (realtime). Show lists with `components/data-table.tsx` by spreading the hook result: `<DataTable columns={...} {...result} />`.
- **New page:** add `app/(app)/<name>/page.tsx` and one `{ title, url, icon }` under a section in `nav` in `components/app-sidebar.tsx` (also sets the header title). A new collection needs its own rule in `firestore.rules` (everything else is closed).
- **All UI text is Indonesian** (labels, buttons, messages). Dates use `id-ID` via `lib/utils.ts`. Code, comments and Firestore field names stay English.
- **Mandatory fields show `*`:** put `required` on the input inside `<Field>`; `FieldLabel` adds the red `*` automatically (CSS in `components/ui/field.tsx`). Don't type `*` by hand, and keep this class if `field` is ever re-added with `shadcn add --overwrite`. Optional fields have no `required`.
- **UI:** shadcn/ui (base-ui flavour: `render` prop instead of `asChild`). Add components with `npx shadcn@latest add <name>` only when needed. Dropdowns use `components/simple-select.tsx`.
- **Colours:** black & white is the main palette (primary buttons, text). Brand blue `#2C3480` is the support colour, via theme tokens in `app/globals.css` only: `--brand` (`bg-brand`, `text-brand`), `--secondary` (secondary buttons and badges, brand tint) and `--ring` (focus). Red (`--destructive`) is only for errors.
- **Feedback:** every user action that writes shows a toast (`import { toast } from "sonner"`; `<Toaster />` is in `app/layout.tsx`): `toast.success(…)` naming what was saved, `toast.error(err.message)` on failure (never `alert`). Dialogs that already show an inline error keep it and only add the success toast.
