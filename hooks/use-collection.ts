"use client"

import { useEffect, useState } from "react"
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type QueryConstraint,
  type WhereFilterOp,
} from "firebase/firestore"

import { useAuth } from "@/components/auth-provider"
import { db } from "@/lib/firebase"

type Options = {
  orderBy?: string
  desc?: boolean
  limit?: number
  /** e.g. `[["status", "==", "onsite"]]` or a date range `[["date", ">=", from], ["date", "<", to]]`. */
  where?: [string, WhereFilterOp, unknown][]
  /** Don't query yet (e.g. a filter value isn't known). Stays in the loading state. */
  skip?: boolean
}

export type CollectionState<T> = {
  data: (T & { id: string })[]
  loading: boolean
  error: Error | null
}

/** Live (realtime) view of a Firestore collection. Starts once a user is signed in. */
export function useCollection<T>(path: string, options: Options = {}) {
  const { orderBy: field, desc, limit: max } = options
  // Compared as text so a new array with the same filters doesn't resubscribe.
  const filters = JSON.stringify(options.where ?? [])
  const uid = useAuth().user?.uid
  const [state, setState] = useState<CollectionState<T>>({
    data: [],
    loading: true,
    error: null,
  })

  useEffect(() => {
    if (!uid || options.skip) return
    const constraints: QueryConstraint[] = (JSON.parse(filters) as Options["where"])!.map(([f, op, v]) => where(f, op, v))
    if (field) constraints.push(orderBy(field, desc ? "desc" : "asc"))
    if (max) constraints.push(limit(max))

    return onSnapshot(
      query(collection(db, path), ...constraints),
      (snap) =>
        setState({
          data: snap.docs.map((d) => ({
            id: d.id,
            ...(d.data({ serverTimestamps: "estimate" }) as T),
          })),
          loading: false,
          error: null,
        }),
      (error) => setState((s) => ({ ...s, loading: false, error }))
    )
  }, [uid, path, field, desc, max, filters, options.skip])

  return state
}
