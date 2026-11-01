"use client"

import { useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"

import { AppSidebar, pageTitle } from "@/components/app-sidebar"
import { useAuth } from "@/components/auth-provider"
import { Separator } from "@/components/ui/separator"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (!loading && !user) router.replace("/login")
  }, [loading, user, router])

  // Always render children (Next.js prerenders this shell); data stays
  // protected by Firestore rules and useCollection waits for the user.
  return (
    <SidebarProvider>
      <AppSidebar />
      {/* min-w-0: wide tables scroll inside their box instead of widening the page. */}
      <SidebarInset className="min-w-0">
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-3">
          <SidebarTrigger />
          <Separator orientation="vertical" className="mr-2 data-vertical:h-4 data-vertical:self-auto" />
          <h1 className="font-medium">{pageTitle(pathname)}</h1>
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  )
}
