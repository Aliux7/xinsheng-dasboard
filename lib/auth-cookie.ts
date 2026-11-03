/**
 * "Signed in" hint for proxy.ts. Firebase keeps the session in the browser (IndexedDB), which the
 * server can't read, so AuthProvider mirrors it in this cookie: set on sign-in, cleared on sign-out.
 * It only decides whether to show the login page first; data stays protected by Firestore rules.
 */
export const AUTH_COOKIE = "xs-signed-in"

export function setAuthCookie(signedIn: boolean) {
  document.cookie = signedIn ? `${AUTH_COOKIE}=1; path=/; max-age=31536000; samesite=lax` : `${AUTH_COOKIE}=; path=/; max-age=0; samesite=lax`
}

/** Where to go after logging in: the `next` page the proxy sent us from, if it is a page of this app. */
export function afterLogin(search: string) {
  const next = new URLSearchParams(search).get("next")
  return next?.startsWith("/") && !next.startsWith("//") ? next : "/"
}
