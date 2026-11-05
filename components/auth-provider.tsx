"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { onAuthStateChanged, type User } from "firebase/auth"
import { doc, getDoc, onSnapshot, serverTimestamp } from "firebase/firestore"

import { setAuthCookie } from "@/lib/auth-cookie"
import { addRecord } from "@/lib/db"
import { auth, db } from "@/lib/firebase"

/**
 * `users/{uid}.role`, highest first: Developer > Master > Admin > Staff (empty).
 * Master and Developer can do everything. Roles are changed on the Pengguna page, only
 * for users ranked below you and only to a role below yours, so nobody can change a
 * Developer. The first Developer is set in the Firebase console.
 */
export type Role = "developer" | "master" | "admin"

export const ROLE_LABELS: Record<Role, string> = {
  developer: "Developer",
  master: "Master",
  admin: "Admin",
}

export const STAFF_LABEL = "Staff"

/** Label for any stored role value (empty or an old one = Staff). */
export const roleLabel = (role?: string | null) => ROLE_LABELS[role as Role] ?? STAFF_LABEL

/** Higher number = higher in the hierarchy; same as `rank()` in firestore.rules. */
export const roleRank = (role?: string | null) => ({ developer: 3, master: 2, admin: 1 })[role as Role] ?? 0

const SUPER: Role[] = ["master", "developer"]

/** `roleLoaded` is false until the profile has been read, so pages don't flash "no access". */
type AuthState = { user: User | null; loading: boolean; role: Role | null; roleLoaded: boolean }

const AuthContext = createContext<AuthState>({ user: null, loading: true, role: null, roleLoaded: false })

// Every login user gets a `users/{uid}` profile the first time they sign in.
async function ensureProfile(user: User) {
  if ((await getDoc(doc(db, "users", user.uid))).exists()) return
  await addRecord(
    "users",
    { email: user.email, createdAt: serverTimestamp() },
    user.uid
  )
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, loading: true, role: null, roleLoaded: false })

  useEffect(() => {
    let stopProfile = () => {}
    const stopAuth = onAuthStateChanged(auth, (user) => {
      stopProfile()
      // Lets proxy.ts send signed-out visitors to /login before the app renders.
      setAuthCookie(!!user)
      setState({ user, loading: false, role: null, roleLoaded: !user })
      if (!user) return
      ensureProfile(user).catch(console.error)
      stopProfile = onSnapshot(doc(db, "users", user.uid), (snap) =>
        setState((s) => ({ ...s, role: (snap.data()?.role as Role | undefined) || null, roleLoaded: true }))
      )
    })
    return () => {
      stopAuth()
      stopProfile()
    }
  }, [])

  return <AuthContext value={state}>{children}</AuthContext>
}

export const useAuth = () => useContext(AuthContext)

const useHasRole = (...roles: Role[]) => {
  const role = useAuth().role
  return !!role && [...SUPER, ...roles].includes(role)
}

/** Admin (and Master/Developer): gate Admin-only features with this. */
export const useIsAdmin = () => useHasRole("admin")

/** Changes roles of users ranked below them: Master or Developer only. */
export const useCanManageRoles = () => useHasRole()
