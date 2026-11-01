"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "firebase/auth";
import { toast } from "sonner";
import {
  BanknoteArrowDownIcon,
  BanknoteArrowUpIcon,
  BookOpenCheckIcon,
  BookOpenIcon,
  BookTextIcon,
  Building2Icon,
  CalculatorIcon,
  CalendarCheckIcon,
  CalendarDaysIcon,
  ChartColumnIcon,
  ChevronDownIcon,
  DatabaseBackupIcon,
  ClipboardCheckIcon,
  CoinsIcon,
  FactoryIcon,
  FileBarChartIcon,
  FileTextIcon,
  GitCompareArrowsIcon,
  ContactIcon,
  CylinderIcon,
  HistoryIcon,
  HourglassIcon,
  LandmarkIcon,
  LayersIcon,
  LayoutGridIcon,
  LinkIcon,
  LayoutDashboardIcon,
  ListTreeIcon,
  NotebookTabsIcon,
  ReceiptIcon,
  ReceiptTextIcon,
  RecycleIcon,
  ScaleIcon,
  SearchIcon,
  LogOutIcon,
  PackageCheckIcon,
  PackageIcon,
  PercentIcon,
  ShipIcon,
  ShoppingBagIcon,
  ShoppingCartIcon,
  TrendingUpIcon,
  TruckIcon,
  UsersIcon,
  WarehouseIcon,
  type LucideIcon,
} from "lucide-react";

import { roleLabel, useAuth } from "@/components/auth-provider";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
} from "@/components/ui/sidebar";
import { auth } from "@/lib/firebase";
import { cn } from "@/lib/utils";

type NavLink = { title: string; url: string; icon: LucideIcon };

/** Add new pages here, under a section. The header title also comes from this list. */
export const nav: { label: string; items: NavLink[] }[] = [
  {
    label: "Ringkasan",
    items: [{ title: "Dasboard", url: "/", icon: LayoutDashboardIcon }],
  },
  {
    label: "Data Master",
    items: [
      { title: "Pemasok", url: "/suppliers", icon: TruckIcon },
      {
        title: "Item pembelian",
        url: "/purchase-items",
        icon: ShoppingCartIcon,
      },
      { title: "Bahan baku gudang", url: "/materials", icon: PackageIcon },
      { title: "Departemen", url: "/departments", icon: Building2Icon },
      { title: "Tipe kain & mesin loom", url: "/looms", icon: LayersIcon },
      { title: "Item penjualan", url: "/products", icon: ShoppingBagIcon },
      { title: "Pelanggan", url: "/customers", icon: ContactIcon },
    ],
  },
  {
    label: "Gudang",
    items: [
      { title: "Timbangan masuk", url: "/weighings", icon: ScaleIcon },
      { title: "Cuci & recycle", url: "/processings", icon: RecycleIcon },
      { title: "Pemakaian bahan", url: "/usage", icon: FactoryIcon },
      { title: "Stok sekarang", url: "/stock", icon: WarehouseIcon },
      { title: "Kartu stok", url: "/stock-card", icon: NotebookTabsIcon },
      { title: "Stok opname", url: "/stock-counts", icon: ClipboardCheckIcon },
    ],
  },
  {
    label: "Kain loom",
    items: [
      { title: "Panen roll", url: "/rolls", icon: CylinderIcon },
      { title: "Stok kain loom", url: "/cloth-stock", icon: LayoutGridIcon },
      {
        title: "Laporan loom bulanan",
        url: "/loom-report",
        icon: ChartColumnIcon,
      },
    ],
  },
  {
    label: "Biaya & produksi",
    items: [
      {
        title: "Pemetaan kode bahan",
        url: "/material-mapping",
        icon: LinkIcon,
      },
      {
        title: "Pencocokan timbangan",
        url: "/matching",
        icon: GitCompareArrowsIcon,
      },
      { title: "Nilai persediaan", url: "/inventory-value", icon: CoinsIcon },
      { title: "HPP bulanan", url: "/hpp", icon: CalculatorIcon },
      { title: "Barang jadi", url: "/finished-goods", icon: PackageCheckIcon },
    ],
  },
  {
    label: "Laporan",
    items: [
      { title: "Neraca", url: "/balance-sheet", icon: ScaleIcon },
      { title: "Laba rugi", url: "/profit-loss", icon: TrendingUpIcon },
      {
        title: "Laporan stok bulanan",
        url: "/stock-report",
        icon: FileBarChartIcon,
      },
      {
        title: "Rekap pemakaian harian",
        url: "/usage-summary",
        icon: CalendarDaysIcon,
      },
    ],
  },
  {
    label: "Pembelian",
    items: [
      {
        title: "Faktur pembelian",
        url: "/purchase-invoices",
        icon: ReceiptIcon,
      },
      { title: "Pembelian impor", url: "/import-purchases", icon: ShipIcon },
      {
        title: "Pembayaran utang",
        url: "/supplier-payments",
        icon: BanknoteArrowUpIcon,
      },
      { title: "Umur utang", url: "/payables-aging", icon: HourglassIcon },
    ],
  },
  {
    label: "Penjualan",
    items: [
      { title: "Faktur penjualan", url: "/sales-invoices", icon: FileTextIcon },
      {
        title: "Penerimaan piutang",
        url: "/customer-receipts",
        icon: BanknoteArrowDownIcon,
      },
      {
        title: "Umur piutang & penjualan",
        url: "/receivables",
        icon: HourglassIcon,
      },
    ],
  },
  {
    label: "Pajak",
    items: [
      { title: "Rekap PPN bulanan", url: "/vat", icon: PercentIcon },
      {
        title: "Daftar PPh dipotong",
        url: "/withholding",
        icon: ReceiptTextIcon,
      },
    ],
  },
  {
    label: "Akuntansi",
    items: [
      { title: "Daftar akun", url: "/accounts", icon: BookOpenIcon },
      { title: "Baris laporan", url: "/report-lines", icon: ListTreeIcon },
      { title: "Jurnal umum", url: "/journal", icon: BookTextIcon },
      { title: "Buku bank", url: "/bank", icon: LandmarkIcon },
      { title: "Buku besar", url: "/ledger", icon: BookOpenCheckIcon },
      { title: "Neraca saldo", url: "/trial-balance", icon: ScaleIcon },
      {
        title: "Tutup periode akuntansi",
        url: "/accounting-periods",
        icon: CalendarCheckIcon,
      },
    ],
  },
  {
    label: "Admin",
    items: [
      { title: "Pengguna", url: "/users", icon: UsersIcon },
      { title: "Riwayat perubahan", url: "/logs", icon: HistoryIcon },
      { title: "Impor data", url: "/imports", icon: DatabaseBackupIcon },
    ],
  },
];

export const pageTitle = (pathname: string) =>
  nav.flatMap((s) => s.items).find((i) => i.url === pathname)?.title;

// Collapsed sections, remembered per browser (localStorage).
const COLLAPSED_KEY = "xinsheng.nav.collapsed";
const listeners = new Set<() => void>();
const readCollapsed = () => {
  try {
    return localStorage.getItem(COLLAPSED_KEY) ?? "[]";
  } catch {
    return "[]";
  }
};
function useCollapsed() {
  const raw = useSyncExternalStore(
    (onChange) => (listeners.add(onChange), () => listeners.delete(onChange)),
    readCollapsed,
    () => "[]",
  );
  const collapsed = new Set<string>(JSON.parse(raw));
  const toggle = (label: string) => {
    if (collapsed.has(label)) collapsed.delete(label);
    else collapsed.add(label);
    try {
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...collapsed]));
    } catch {
      // Private mode etc.: the sidebar still works, it just won't remember.
    }
    listeners.forEach((l) => l());
  };
  return { collapsed, toggle };
}

// Styles from @shadcn-space/sidebar-01.
const itemClass =
  "h-9 cursor-pointer rounded-md px-3 py-2 text-sm font-medium transition-colors";

export function AppSidebar(props: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname();
  const { user, role } = useAuth();
  const [search, setSearch] = useState("");
  const { collapsed, toggle } = useCollapsed();

  // While searching, show only matching pages (or whole matching sections), all expanded.
  const q = search.trim().toLowerCase();
  const sections = nav
    .map((section) => ({
      ...section,
      items:
        !q || section.label.toLowerCase().includes(q)
          ? section.items
          : section.items.filter((i) => i.title.toLowerCase().includes(q)),
    }))
    .filter((section) => section.items.length);

  return (
    <Sidebar
      className="h-full px-0 [&_[data-slot=sidebar-inner]]:h-full"
      {...props}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-0">
        <SidebarHeader className="px-4">
          <Link
            href="/"
            className="flex items-center gap-0 text-xl font-semibold italic"
          >
            <Logo className="text-black bg-transparent text-3xl p-0 m-0 h-14 w-6.5" />
            insheng
          </Link>
        </SidebarHeader>
        <div className="px-4 pb-3">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari menu"
              aria-label="Cari menu"
              className="pl-8"
            />
          </div>
        </div>
        <SidebarContent className="overflow-hidden">
          <ScrollArea className="h-full">
            <div className="px-4 pb-10">
              {!sections.length && (
                <p className="px-3 py-2 text-sm text-muted-foreground">
                  Menu tidak ditemukan.
                </p>
              )}
              {sections.map((section) => {
                const open = !!q || !collapsed.has(section.label);
                return (
                  <SidebarGroup
                    key={section.label}
                    className="p-0 pt-5 first:pt-0"
                  >
                    <SidebarGroupLabel className="p-0 text-xs font-medium text-sidebar-foreground uppercase">
                      <button
                        type="button"
                        onClick={() => toggle(section.label)}
                        aria-expanded={open}
                        className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-sm text-left hover:text-foreground"
                      >
                        {section.label}
                        <ChevronDownIcon
                          className={cn(
                            "size-4 shrink-0 transition-transform duration-200",
                            !open && "-rotate-90",
                          )}
                        />
                      </button>
                    </SidebarGroupLabel>
                    {open && (
                      <SidebarMenu>
                        {section.items.map((item) => {
                          const active = pathname === item.url;
                          return (
                            <SidebarMenuItem key={item.url}>
                              <SidebarMenuButton
                                isActive={active}
                                className={cn(
                                  itemClass,
                                  active &&
                                    "bg-primary! text-primary-foreground!",
                                )}
                                render={<Link href={item.url} />}
                              >
                                <item.icon />
                                {item.title}
                              </SidebarMenuButton>
                            </SidebarMenuItem>
                          );
                        })}
                      </SidebarMenu>
                    )}
                  </SidebarGroup>
                );
              })}
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
