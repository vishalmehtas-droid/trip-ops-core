import {
  BookOpenCheck,
  Building2,
  CircleDollarSign,
  ClipboardList,
  FileBarChart,
  Gauge,
  Globe2,
  Landmark,
  Receipt,
  ScrollText,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Tags,
  Users,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type NavItem = {
  label: string;
  to: string;
  icon: LucideIcon;
  /** null = available in Phase 1 */
  phase: number | null;
  /** When set, the item is only listed for users holding this permission. */
  permission?: string;
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [{ label: "Dashboard", to: "/dashboard", icon: Gauge, phase: null }],
  },
  {
    label: "Operations",
    items: [
      {
        label: "Bookings",
        to: "/sales",
        icon: ClipboardList,
        phase: null,
        permission: "sales.read",
      },
      { label: "Purchases", to: "/purchases", icon: ShoppingCart, phase: 2 },
    ],
  },
  {
    label: "Finance",
    items: [
      { label: "Receipts", to: "/receipts", icon: Receipt, phase: 3 },
      { label: "Payments", to: "/payments", icon: Wallet, phase: 3 },
    ],
  },
  {
    label: "Masters",
    items: [
      {
        label: "Clients",
        to: "/clients",
        icon: Users,
        phase: null,
        permission: "clients.read",
      },
      {
        label: "Vendors",
        to: "/vendors",
        icon: Building2,
        phase: null,
        permission: "vendors.read",
      },
      {
        label: "Destinations",
        to: "/destinations",
        icon: Globe2,
        phase: null,
        permission: "destinations.read",
      },
    ],
  },
  {
    label: "Reports",
    items: [
      { label: "Client Ledger", to: "/reports/client-ledger", icon: BookOpenCheck, phase: 4 },
      { label: "Vendor Ledger", to: "/reports/vendor-ledger", icon: BookOpenCheck, phase: 4 },
      { label: "Cashflow", to: "/reports/cashflow", icon: CircleDollarSign, phase: 4 },
      { label: "Profitability", to: "/reports/profitability", icon: FileBarChart, phase: 4 },
      { label: "GST", to: "/reports/gst", icon: Landmark, phase: 4 },
    ],
  },
  {
    label: "Administration",
    items: [
      { label: "Users", to: "/users", icon: ShieldCheck, phase: null, permission: "users.read" },
      { label: "Settings", to: "/settings", icon: Settings, phase: null },
      {
        label: "Audit Log",
        to: "/audit-log",
        icon: ScrollText,
        phase: null,
        permission: "audit.read",
      },
    ],
  },
];

export const ALL_NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) => group.items);
