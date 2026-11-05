"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "firebase/auth";
import { toast } from "sonner";
import { ArrowLeftRightIcon, BookCheckIcon, BookOpenIcon, BookTextIcon, Building2Icon, CoinsIcon, FactoryIcon, FlagIcon, FlaskConicalIcon, HistoryIcon, LandmarkIcon, ListChecksIcon, ListTreeIcon, LogOutIcon, NotebookPenIcon, PackageIcon, ScaleIcon, TrendingUpIcon, UsersIcon, type LucideIcon } from "lucide-react";

import { roleLabel, useAuth } from "@/components/auth-provider";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { auth } from "@/lib/firebase";
import { cn } from "@/lib/utils";

type NavLink = { title: string; url: string; icon: LucideIcon };

/** Add new pages here, under a section. The header title also comes from this list. */
export const nav: { label: string; items: NavLink[] }[] = [
  {
    label: "Keuangan",
    items: [
      { title: "Daftar akun", url: "/accounts", icon: BookOpenIcon },
      { title: "Baris laporan", url: "/report-lines", icon: ListTreeIcon },
      { title: "Saldo awal", url: "/opening-balances", icon: FlagIcon },
      { title: "Buku bank", url: "/bank", icon: LandmarkIcon },
      { title: "Jurnal buku bank", url: "/bank-journal", icon: BookCheckIcon },
      { title: "Jurnal umum", url: "/journals", icon: NotebookPenIcon },
      { title: "Buku besar", url: "/ledger", icon: BookTextIcon },
      { title: "Neraca saldo", url: "/trial-balance", icon: ListChecksIcon },
    ],
  },
  {
    label: "Gudang",
    items: [
      { title: "Stok bahan baku", url: "/inventory", icon: PackageIcon },
      { title: "Riwayat stok", url: "/inventory-movements", icon: ArrowLeftRightIcon },
      { title: "Nilai persediaan", url: "/inventory-value", icon: CoinsIcon },
      { title: "Departemen", url: "/departments", icon: Building2Icon },
    ],
  },
  {
    label: "Laporan",
    items: [
      { title: "HPP bulanan", url: "/cogs", icon: FactoryIcon },
      { title: "Neraca", url: "/balance-sheet", icon: ScaleIcon },
      { title: "Laba rugi", url: "/profit-loss", icon: TrendingUpIcon },
    ],
  },
  {
    label: "Admin",
    items: [
      { title: "Pengguna", url: "/users", icon: UsersIcon },
      { title: "Riwayat perubahan", url: "/logs", icon: HistoryIcon },
      { title: "Data uji", url: "/test-data", icon: FlaskConicalIcon },
    ],
  },
];

export const pageTitle = (pathname: string) =>
  nav.flatMap((s) => s.items).find((i) => i.url === pathname)?.title;

// Styles from @shadcn-space/sidebar-01.
const itemClass =
  "h-9 cursor-pointer rounded-md px-3 py-2 text-sm font-medium transition-colors";

export function AppSidebar(props: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname();
  const { user, role } = useAuth();
  // On a phone the menu is a sheet over the page: close it once a page is chosen.
  const { isMobile, setOpenMobile } = useSidebar();
  const close = () => isMobile && setOpenMobile(false);

  return (
    <Sidebar
      className="h-full px-0 [&_[data-slot=sidebar-inner]]:h-full"
      {...props}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-0">
        <SidebarHeader className="px-4">
          <Link
            href="/accounts"
            onClick={close}
            className="flex items-center gap-0 text-xl font-semibold italic"
          >
            <Logo className="text-black bg-transparent text-3xl p-0 m-0 h-14 w-6.5" />
            insheng
          </Link>
        </SidebarHeader>
        <SidebarContent className="overflow-hidden">
          <ScrollArea className="h-full">
            <div className="px-4 pb-10">
              {nav.map((section) => (
                <SidebarGroup key={section.label} className="p-0 pt-5 first:pt-0">
                  <SidebarGroupLabel className="p-0 text-xs font-semibold tracking-wide text-brand uppercase">
                    {section.label}
                  </SidebarGroupLabel>
                  <SidebarMenu>
                    {section.items.map((item) => {
                      const active = pathname === item.url;
                      return (
                        <SidebarMenuItem key={item.url}>
                          <SidebarMenuButton
                            isActive={active}
                            className={cn(itemClass, active && "bg-primary! text-primary-foreground!")}
                            render={<Link href={item.url} onClick={close} />}
                          >
                            <item.icon />
                            {item.title}
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroup>
              ))}
            </div>
          </ScrollArea>
        </SidebarContent>
      </div>
      <SidebarFooter className="flex-row items-center gap-2 border-t p-2">
        <div className="min-w-0 flex-1 px-3 leading-tight">
          <p className="truncate text-sm font-bold" title={user?.email ?? ""}>
            {user?.email}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {roleLabel(role)}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 scale-90 text-muted-foreground cursor-pointer hover:bg-destructive/10 hover:text-destructive"
          onClick={() => signOut(auth).catch((err) => toast.error(err.message))}
          aria-label="Keluar"
          title="Keluar"
        >
          <LogOutIcon className="size-4" />
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
