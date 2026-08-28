import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { ChevronDown, LogOut, Menu, Settings, ShieldAlert, UserRound } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";

import { NAV_GROUPS, ALL_NAV_ITEMS } from "@/lib/navigation";
import { ROLE_LABELS, useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="grid size-8 place-items-center rounded bg-primary">
        <div className="size-3.5 rounded-full border-2 border-brand" />
      </div>
      <span className="text-base font-bold tracking-tight text-foreground">
        Triptastic<span className="text-brand">Ops</span>
      </span>
    </div>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const { hasPermission } = useAuth();

  // Navigation visibility is a convenience only — every protected page verifies
  // authorization independently, and the database enforces it regardless.
  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.permission || hasPermission(item.permission)),
  })).filter((group) => group.items.length > 0);

  return (
    <nav className="space-y-6 px-3 pb-8">
      {groups.map((group) => (
        <div key={group.label}>
          <p className="px-2 pb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            {group.label}
          </p>
          <div className="space-y-0.5">
            {group.items.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={onNavigate}
                activeProps={{ className: "bg-secondary text-foreground" }}
                inactiveProps={{ className: "text-muted-foreground hover:bg-secondary/60" }}
                className="flex items-center justify-between gap-2 rounded-md px-2 py-2 text-sm font-medium transition-colors"
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <item.icon className="size-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </span>
                {item.phase ? (
                  <span className="rounded bg-secondary px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
                    P{item.phase}
                  </span>
                ) : null}
              </Link>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

function initialsOf(value: string) {
  const parts = value.trim().split(/[\s.@_-]+/).filter(Boolean);
  return (parts.slice(0, 2).map((p) => p[0]).join("") || "U").toUpperCase();
}

function UserMenu() {
  const { profile, primaryRole, signOut } = useAuth();
  const navigate = useNavigate();
  const label = profile?.name || profile?.email || "User";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 rounded-md border border-border bg-surface px-2 py-1.5 text-left transition-colors hover:bg-secondary/60">
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-secondary text-[10px] font-bold text-muted-foreground">
            {initialsOf(label)}
          </span>
          <span className="hidden min-w-0 sm:block">
            <span className="block truncate text-xs font-semibold text-foreground">{label}</span>
            <span className="block truncate text-[10px] uppercase tracking-wide text-muted-foreground">
              {primaryRole ? ROLE_LABELS[primaryRole] : "No role"}
            </span>
          </span>
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          {profile?.email}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate({ to: "/settings" })}>
          <UserRound className="size-4" /> My profile
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => navigate({ to: "/settings" })}>
          <Settings className="size-4" /> Settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={async () => {
            await signOut();
            navigate({ to: "/auth", replace: true });
          }}
        >
          <LogOut className="size-4" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DeactivatedScreen() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 font-sans">
      <div className="w-full max-w-md rounded-lg border border-border bg-surface p-6 text-center shadow-panel">
        <div className="mx-auto grid size-11 place-items-center rounded-full border border-destructive/30 text-destructive">
          <ShieldAlert className="size-5" />
        </div>
        <h1 className="mt-4 text-base font-semibold text-foreground">Account deactivated</h1>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          {profile?.email ?? "This account"} no longer has access to Triptastic Ops. Your login
          still exists — contact an administrator to have access restored.
        </p>
        <Button
          className="mt-5 w-full"
          onClick={async () => {
            await signOut();
            navigate({ to: "/auth", replace: true });
          }}
        >
          Sign out
        </Button>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { loading, profile } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const current = ALL_NAV_ITEMS.find((item) => item.to === pathname);

  if (!loading && profile && !profile.is_active) return <DeactivatedScreen />;

  return (
    <div className="min-h-screen bg-background font-sans text-foreground">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border bg-surface lg:flex">
        <div className="flex h-14 items-center border-b border-border px-4">
          <Logo />
        </div>
        <ScrollArea className="flex-1 py-4">
          <NavLinks />
        </ScrollArea>
        <div className="border-t border-border p-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Phase 1 · Foundation
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-border bg-surface/95 px-4 backdrop-blur">
          <div className="flex min-w-0 items-center gap-3">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation">
                  <Menu className="size-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-0">
                <SheetTitle className="flex h-14 items-center border-b border-border px-4">
                  <Logo />
                </SheetTitle>
                <ScrollArea className="h-[calc(100vh-3.5rem)] py-4">
                  <NavLinks onNavigate={() => setMobileOpen(false)} />
                </ScrollArea>
              </SheetContent>
            </Sheet>

            <div className="lg:hidden">
              <Logo />
            </div>

            <div className="hidden items-center gap-2 text-xs font-medium text-muted-foreground lg:flex">
              <span className="uppercase tracking-widest">App</span>
              <span className="text-border">/</span>
              <span className="font-semibold text-foreground">{current?.label ?? "Overview"}</span>
              {current?.phase ? (
                <Badge variant="outline" className="text-[9px] uppercase">
                  Phase {current.phase}
                </Badge>
              ) : null}
            </div>
          </div>

          <UserMenu />
        </header>

        <main className={cn("mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:py-8")}>{children}</main>
      </div>
    </div>
  );
}
