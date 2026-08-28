import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ROLE_LABELS, useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Triptastic Ops" },
      { name: "description", content: "Your profile and application settings." },
      { property: "og:title", content: "Settings — Triptastic Ops" },
      { property: "og:description", content: "Your profile and application settings." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SettingsPage,
});

const nameSchema = z.string().trim().min(2, "Name must be at least 2 characters").max(80);

function SettingsPage() {
  const { profile, roles, refresh } = useAuth();
  const [name, setName] = useState(profile?.name ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(profile?.name ?? "");
  }, [profile?.name]);

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    const parsed = nameSchema.safeParse(name);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid name");
      return;
    }
    setError(null);
    setSaving(true);
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ name: parsed.data })
      .eq("id", profile?.id ?? "");
    setSaving(false);

    if (updateError) {
      toast.error("Could not save your profile", { description: updateError.message });
      return;
    }
    await refresh();
    toast.success("Profile updated");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Manage your own profile. Organisation-wide settings arrive with the later modules."
      />

      <form
        onSubmit={handleSave}
        className="max-w-xl space-y-4 rounded-lg border border-border bg-surface p-5 shadow-panel"
      >
        <h2 className="text-sm font-semibold text-foreground">My profile</h2>

        <div className="space-y-1.5">
          <Label
            htmlFor="name"
            className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground"
          >
            Display name
          </Label>
          <Input id="name" value={name} onChange={(event) => setName(event.target.value)} />
          {error ? <p className="text-[11px] font-medium text-destructive">{error}</p> : null}
        </div>

        <div className="space-y-1.5">
          <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Email
          </Label>
          <Input value={profile?.email ?? ""} readOnly disabled />
          <p className="text-[11px] text-muted-foreground">
            Email and account status can only be changed by an administrator.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Roles
          </Label>
          <div className="flex flex-wrap gap-2">
            {roles.length === 0 ? (
              <span className="text-xs text-muted-foreground">No role assigned yet.</span>
            ) : (
              roles.map((role) => (
                <Badge key={role} variant="outline" className="text-[10px] uppercase">
                  {ROLE_LABELS[role]}
                </Badge>
              ))
            )}
          </div>
        </div>

        <Separator />

        <Button type="submit" disabled={saving}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : null}
          Save changes
        </Button>
      </form>

      <div className="max-w-xl rounded-lg border border-dashed border-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-foreground">Organisation settings</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Company details, GST profile, numbering series and currency configuration will be
          introduced alongside the financial modules in Phase 2.
        </p>
      </div>
    </div>
  );
}
