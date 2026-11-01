import { useSyncExternalStore } from "react"

import { today } from "@/lib/utils"

const subscribe = () => () => {}

/**
 * Today's date (YYYY-MM-DD) in the browser, or null while Next.js prerenders the
 * page — reading the clock during prerender is a build error with cacheComponents.
 */
export function useToday() {
  return useSyncExternalStore(subscribe, () => today(), () => null)
}
