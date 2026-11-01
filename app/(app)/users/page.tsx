"use client"

import type { Timestamp } from "firebase/firestore"
import { toast } from "sonner"

import { ROLE_LABELS, STAFF_LABEL, roleLabel, roleRank, useAuth, useCanManageRoles, type Role } from "@/components/auth-provider"
import { DataTable, type Column } from "@/components/data-table"
import { SimpleSelect } from "@/components/simple-select"
import { useCollection } from "@/hooks/use-collection"
import { updateRecord } from "@/lib/db"
import { formatDate } from "@/lib/utils"

type User = { id: string; email: string; createdAt?: Timestamp; role?: Role | "" }

const STAFF = "staff"
const allOptions = [...Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label })), { value: STAFF, label: STAFF_LABEL }]

/**
 * Developer > Master > Admin > Staff. You can change a user ranked below you, to a role
 * below yours (firestore.rules enforces the same), so nobody can change a Developer.
 */
function RoleCell({ user, myRank }: { user: User; myRank: number }) {
  if (roleRank(user.role) >= myRank) return roleLabel(user.role)
  const options = allOptions.filter((o) => roleRank(o.value) < myRank)
  return (
    <div className="w-40">
      <SimpleSelect
        id={`role-${user.id}`}
        value={user.role && roleRank(user.role) ? user.role : STAFF}
        onChange={(v) =>
          updateRecord("users", user.id, { role: v === STAFF ? "" : v })
            .then(() => toast.success(`Peran ${user.email} diubah menjadi ${roleLabel(v === STAFF ? "" : (v as Role))}.`))
            .catch((err) => toast.error(err.message))
        }
        options={options}
      />
    </div>
  )
}

export default function UsersPage() {
  const canManage = useCanManageRoles()
  const { role } = useAuth()
  const myRank = canManage ? roleRank(role) : 0
  const users = useCollection<User>("users", { orderBy: "email" })

  const columns: Column<User>[] = [
    { header: "Email", cell: (u) => u.email },
    { header: "Peran", cell: (u) => <RoleCell user={u} myRank={myRank} /> },
    { header: "Bergabung", cell: (u) => formatDate(u.createdAt), className: "text-muted-foreground" },
  ]

  return <DataTable columns={columns} {...users} empty="Belum ada pengguna." />
}
