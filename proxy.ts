import { NextResponse, type NextRequest } from "next/server"

import { AUTH_COOKIE } from "@/lib/auth-cookie"

/**
 * Sends visitors who aren't signed in to /login before any page renders, so the app never flashes.
 * The cookie is only a hint (lib/auth-cookie.ts): app/(app)/layout.tsx still redirects if the Firebase
 * session has actually ended, and Firestore rules protect the data.
 */
export function proxy(request: NextRequest) {
  if (request.cookies.get(AUTH_COOKIE)?.value) return NextResponse.next()
  const login = new URL("/login", request.url)
  const { pathname, search } = request.nextUrl
  if (pathname !== "/") login.searchParams.set("next", pathname + search)
  return NextResponse.redirect(login)
}

export const config = {
  // Every page except the login page, Next.js files, the app icons and files with an extension.
  matcher: ["/((?!login|_next/|icon|apple-icon|favicon\\.ico|.*\\.[\\w]+$).*)"],
}
