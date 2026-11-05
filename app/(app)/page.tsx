"use client"

import { roleLabel, useAuth } from "@/components/auth-provider"

export default function HomePage() {
  const { user, role } = useAuth()
  return (
    <p className="text-sm text-muted-foreground">
      Masuk sebagai <span className="font-medium text-foreground">{user?.email}</span> ({roleLabel(role)}).
    </p>
  )
}
