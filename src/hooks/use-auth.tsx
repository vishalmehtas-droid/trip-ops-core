import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Session, User } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "sales" | "operations" | "accounts" | "viewer";

export type Profile = {
  id: string;
  name: string;
  email: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type AuthState = {
  loading: boolean;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  roles: AppRole[];
  permissions: string[];
  primaryRole: AppRole | null;
  isAdmin: boolean;
  hasRole: (role: AppRole) => boolean;
  hasAnyRole: (roles: AppRole[]) => boolean;
  hasPermission: (permission: string) => boolean;
  refresh: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
};

const ROLE_PRIORITY: AppRole[] = ["admin", "accounts", "operations", "sales", "viewer"];

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const loadIdentity = useCallback(async (activeSession: Session | null) => {
    if (!activeSession?.user) {
      setProfile(null);
      setRoles([]);
      setPermissions([]);
      return;
    }

    const user = activeSession.user;

    // The database is the source of truth. Provisioning happens through a
    // trusted SECURITY DEFINER routine that derives identity from the verified
    // auth token — the client cannot supply an arbitrary id or email.
    const { data: existing } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    let profileRow = existing as Profile | null;

    if (!profileRow) {
      const { data: provisioned } = await supabase.rpc("ensure_own_profile");
      profileRow = (provisioned as Profile | null) ?? null;
    }

    setProfile(profileRow);


    const { data: roleRows } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);

    const nextRoles = ((roleRows ?? []) as { role: AppRole }[]).map((r) => r.role);
    setRoles(nextRoles);

    if (nextRoles.length > 0) {
      const { data: permissionRows } = await supabase
        .from("role_permissions")
        .select("permission_key, role")
        .in("role", nextRoles);
      setPermissions(
        Array.from(
          new Set(((permissionRows ?? []) as { permission_key: string }[]).map((p) => p.permission_key)),
        ),
      );
    } else {
      setPermissions([]);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const { data: subscription } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      if (event === "SIGNED_OUT") {
        setProfile(null);
        setRoles([]);
        setPermissions([]);
        return;
      }
      if (event === "SIGNED_IN" || event === "USER_UPDATED" || event === "INITIAL_SESSION") {
        void loadIdentity(nextSession);
      }
    });

    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      setSession(data.session);
      await loadIdentity(data.session);
      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, [loadIdentity]);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    setSession(data.session);
    await loadIdentity(data.session);
  }, [loadIdentity]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    return { error: null };
  }, []);

  const signOut = useCallback(async () => {
    // Stop in-flight protected queries and drop their cache BEFORE the session
    // is cleared, so no protected data can flash after sign-out.
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    setProfile(null);
    setRoles([]);
    setPermissions([]);
  }, [queryClient]);

  const value = useMemo<AuthState>(() => {
    const isActive = profile?.is_active ?? false;
    const isAdmin = isActive && roles.includes("admin");
    return {
      loading,
      session,
      user: session?.user ?? null,
      profile,
      isActive,
      roles,
      permissions,
      primaryRole: ROLE_PRIORITY.find((role) => roles.includes(role)) ?? null,
      isAdmin,
      hasRole: (role) => isActive && roles.includes(role),
      hasAnyRole: (candidates) => isActive && candidates.some((role) => roles.includes(role)),
      hasPermission: (permission) =>
        isActive && (isAdmin || permissions.includes(permission)),
      refresh,
      signIn,
      signOut,
    };
  }, [loading, session, profile, roles, permissions, refresh, signIn, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside <AuthProvider>");
  return context;
}

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Admin",
  sales: "Sales",
  operations: "Operations",
  accounts: "Accounts",
  viewer: "Viewer",
};
