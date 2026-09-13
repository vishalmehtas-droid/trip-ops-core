import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  Building2,
  CalendarClock,
  Clock3,
  Globe2,
  Plane,
  Plus,
  UserPlus,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { SaleStatusBadge } from "@/components/app/sales-ui";
import { EmptyState, ErrorState, TableSkeleton, UnauthorizedState } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import type { SaleStatus } from "@/lib/sales-schemas";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Operations Dashboard — Triptastic Ops" },
      {
        name: "description",
        content: "Today's travel operations: upcoming departures, pending bookings and activity.",
      },
      { property: "og:title", content: "Operations Dashboard — Triptastic Ops" },
      {
        property: "og:description",
        content: "Today's travel operations: upcoming departures, pending bookings and activity.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DashboardPage,
});

type DashboardSale = {
  id: string;
  booking_date: string;
  travel_date: string | null;
  status: SaleStatus;
  created_at: string;
  updated_at: string;
  client: { name: string } | null;
  destination: { name: string } | null;
  sales_items: { count: number }[];
};

const SELECT =
  "id, booking_date, travel_date, status, created_at, updated_at, client:clients(name), destination:destinations(name), sales_items(count)";

function todayISO() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function shortDay(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return {
    day: date.toLocaleDateString(undefined, { day: "2-digit" }),
    month: date.toLocaleDateString(undefined, { month: "short" }).toUpperCase(),
  };
}

function longDate(value: string | null) {
  if (!value) return "Date to be advised";
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function bookingRef(id: string) {
  return `TH-${id.slice(0, 8).toUpperCase()}`;
}

function itemCount(sale: DashboardSale) {
  return sale.sales_items?.[0]?.count ?? 0;
}

function SummaryCard({
  label,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  hint: string;
  icon: LucideIcon;
  tone: "brand" | "warm" | "success" | "warning";
}) {
  const tones = {
    brand: "bg-brand-muted text-brand",
    warm: "bg-accent-warm-muted text-accent-warm",
    success: "bg-success/10 text-success",
    warning: "bg-warning/15 text-warning",
  } as const;

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-panel">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{value}</p>
        </div>
        <span className={`grid size-10 place-items-center rounded-xl ${tones[tone]}`}>
          <Icon className="size-5" />
        </span>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{hint}</p>
    </div>
  );
}

function SectionHeading({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <h2 className="text-sm font-semibold tracking-tight text-foreground">{title}</h2>
      {action}
    </div>
  );
}

function DashboardPage() {
  const { profile, hasPermission } = useAuth();
  const canReadSales = hasPermission("sales.read");

  const salesQuery = useQuery({
    queryKey: ["dashboard", "sales"],
    enabled: canReadSales,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select(SELECT)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as DashboardSale[];
    },
  });

  const today = todayISO();
  const sales = salesQuery.data ?? [];

  const stats = useMemo(() => {
    const open = sales.filter((s) => s.status === "pending" || s.status === "confirmed");
    const upcoming = open
      .filter((s) => s.travel_date && s.travel_date >= today)
      .sort((a, b) => (a.travel_date ?? "").localeCompare(b.travel_date ?? ""));
    const pending = sales.filter((s) => s.status === "pending");
    const attention = open.filter(
      (s) => !s.travel_date || s.travel_date < today || (s.status === "pending" && itemCount(s) === 0),
    );
    return {
      open,
      upcoming,
      pending,
      attention,
      createdToday: sales.filter((s) => s.created_at.slice(0, 10) === today),
      travellingToday: open.filter((s) => s.travel_date === today),
      recentlyUpdated: [...sales]
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
        .slice(0, 4),
    };
  }, [sales, today]);

  const firstName = (profile?.name || profile?.email || "there").split(/[\s@]/)[0];
  const dateLabel = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const quickActions = [
    {
      label: "New Booking",
      to: "/sales",
      icon: Plus,
      allowed: hasPermission("sales.manage"),
    },
    { label: "Add Client", to: "/clients", icon: UserPlus, allowed: hasPermission("clients.manage") },
    {
      label: "Add Vendor",
      to: "/vendors",
      icon: Building2,
      allowed: hasPermission("vendors.manage"),
    },
    {
      label: "Add Destination",
      to: "/destinations",
      icon: Globe2,
      allowed: hasPermission("destinations.manage"),
    },
  ].filter((action) => action.allowed);

  return (
    <div className="space-y-8">
      <header className="rounded-2xl border border-border bg-surface p-6 shadow-panel sm:p-8">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          {dateLabel}
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {greeting()}, {firstName} 👋
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
          Here&apos;s what&apos;s happening with your trips today.
        </p>
      </header>

      {!canReadSales ? (
        <UnauthorizedState description="Your role does not include booking visibility. Ask an administrator for access to see travel operations here." />
      ) : salesQuery.isError ? (
        <ErrorState onRetry={() => salesQuery.refetch()} />
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              label="Active Bookings"
              value={stats.open.length}
              hint="Pending and confirmed trips currently in progress"
              icon={Plane}
              tone="brand"
            />
            <SummaryCard
              label="Upcoming Departures"
              value={stats.upcoming.length}
              hint="Trips departing today or later"
              icon={CalendarClock}
              tone="success"
            />
            <SummaryCard
              label="Pending Bookings"
              value={stats.pending.length}
              hint="Awaiting confirmation from the team"
              icon={Clock3}
              tone="warning"
            />
            <SummaryCard
              label="Needs Attention"
              value={stats.attention.length}
              hint="Missing travel dates, past departures or no components yet"
              icon={AlertCircle}
              tone="warm"
            />
          </section>

          <section className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
            <div>
              <SectionHeading
                title="Upcoming Travel"
                action={
                  <Button asChild variant="ghost" size="sm">
                    <Link to="/sales">View all</Link>
                  </Button>
                }
              />
              {salesQuery.isPending ? (
                <TableSkeleton rows={4} />
              ) : stats.upcoming.length === 0 ? (
                <EmptyState
                  title="No upcoming travel"
                  description="Trips with a future travel date will appear here."
                />
              ) : (
                <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
                  {stats.upcoming.slice(0, 6).map((sale) => {
                    const stamp = shortDay(sale.travel_date as string);
                    return (
                      <li key={sale.id}>
                        <Link
                          to="/sales/$saleId"
                          params={{ saleId: sale.id }}
                          className="flex items-center gap-4 p-4 transition-colors hover:bg-muted/60"
                        >
                          <span className="grid w-14 shrink-0 place-items-center rounded-xl bg-brand-muted py-2 text-brand">
                            <span className="text-lg font-semibold leading-none">{stamp.day}</span>
                            <span className="mt-0.5 text-[10px] font-bold tracking-wider">
                              {stamp.month}
                            </span>
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-foreground">
                              {sale.client?.name ?? "Client removed"}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {sale.destination?.name ?? "Destination not set"} ·{" "}
                              {itemCount(sale)} component{itemCount(sale) === 1 ? "" : "s"}
                            </span>
                          </span>
                          <SaleStatusBadge status={sale.status} />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="space-y-6">
              <div>
                <SectionHeading title="Quick Actions" />
                {quickActions.length === 0 ? (
                  <EmptyState
                    title="No actions available"
                    description="Your role has read-only access."
                  />
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {quickActions.map((action) => (
                      <Link
                        key={action.label}
                        to={action.to}
                        className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 shadow-panel transition-colors hover:border-brand/40 hover:bg-brand-muted/50"
                      >
                        <span className="grid size-9 place-items-center rounded-xl bg-accent-warm-muted text-accent-warm">
                          <action.icon className="size-4" />
                        </span>
                        <span className="text-sm font-semibold text-foreground">{action.label}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <SectionHeading title="Today's Operations" />
                <div className="space-y-3 rounded-2xl border border-border bg-surface p-5 shadow-panel">
                  {[
                    { label: "New bookings created today", value: stats.createdToday.length },
                    { label: "Travelling today", value: stats.travellingToday.length },
                    { label: "Awaiting confirmation", value: stats.pending.length },
                  ].map((row) => (
                    <div
                      key={row.label}
                      className="flex items-center justify-between gap-3 text-sm"
                    >
                      <span className="text-muted-foreground">{row.label}</span>
                      <span className="font-semibold text-foreground">{row.value}</span>
                    </div>
                  ))}
                  <div className="border-t border-border pt-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Recently updated
                    </p>
                    {stats.recentlyUpdated.length === 0 ? (
                      <p className="mt-2 text-xs text-muted-foreground">No booking activity yet.</p>
                    ) : (
                      <ul className="mt-2 space-y-2">
                        {stats.recentlyUpdated.map((sale) => (
                          <li key={sale.id} className="truncate text-xs">
                            <Link
                              to="/sales/$saleId"
                              params={{ saleId: sale.id }}
                              className="text-foreground hover:text-brand"
                            >
                              {sale.client?.name ?? bookingRef(sale.id)}
                            </Link>
                            <span className="text-muted-foreground">
                              {" "}
                              · {longDate(sale.updated_at.slice(0, 10))}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section>
            <SectionHeading
              title="Recent Bookings"
              action={
                <Button asChild variant="ghost" size="sm">
                  <Link to="/sales">Open bookings</Link>
                </Button>
              }
            />
            {salesQuery.isPending ? (
              <TableSkeleton rows={5} />
            ) : sales.length === 0 ? (
              <EmptyState
                title="No bookings yet"
                description="Bookings you create will be listed here."
              />
            ) : (
              <div className="overflow-hidden rounded-2xl border border-border bg-surface">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Booking</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Destination</TableHead>
                      <TableHead>Travel date</TableHead>
                      <TableHead className="text-right">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sales.slice(0, 6).map((sale) => (
                      <TableRow key={sale.id}>
                        <TableCell className="font-medium">
                          <Link
                            to="/sales/$saleId"
                            params={{ saleId: sale.id }}
                            className="text-foreground hover:text-brand"
                          >
                            {bookingRef(sale.id)}
                          </Link>
                        </TableCell>
                        <TableCell>{sale.client?.name ?? "—"}</TableCell>
                        <TableCell>{sale.destination?.name ?? "—"}</TableCell>
                        <TableCell>{longDate(sale.travel_date)}</TableCell>
                        <TableCell className="text-right">
                          <SaleStatusBadge status={sale.status} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
