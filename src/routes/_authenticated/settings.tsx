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
import { useServerFn } from "@tanstack/react-start";
import { updateCompanySettings } from "@/lib/invoices.functions";

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
  const { profile, roles, refresh, isAdmin } = useAuth();
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

      {isAdmin ? <MarkupDefaultEditor /> : null}
      {isAdmin ? <CompanySettingsEditor /> : null}

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

const percentSchema = z
  .string()
  .trim()
  .regex(/^\d{1,4}(\.\d{1,2})?$/, "Enter a percentage with at most 2 decimals")
  .refine((v) => Number(v) <= 1000, "Too large");

function MarkupDefaultEditor() {
  const [value, setValue] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void supabase
      .from("app_settings")
      .select("default_markup_percent")
      .maybeSingle()
      .then(({ data }) => {
        setValue(data ? String(data.default_markup_percent) : "10");
        setLoaded(true);
      });
  }, []);

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    const parsed = percentSchema.safeParse(value);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid percentage");
      return;
    }
    setError(null);
    setSaving(true);
    const { error: updateError } = await supabase
      .from("app_settings")
      .update({ default_markup_percent: Number(parsed.data) })
      .eq("id", true);
    setSaving(false);
    if (updateError) {
      toast.error("Could not save the default markup", { description: updateError.message });
      return;
    }
    toast.success("Default markup saved");
  }

  return (
    <form
      onSubmit={handleSave}
      className="max-w-xl space-y-4 rounded-lg border border-border bg-surface p-5 shadow-panel"
    >
      <h2 className="text-sm font-semibold text-foreground">Quote defaults</h2>
      <div className="space-y-1.5">
        <Label
          htmlFor="default-markup"
          className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground"
        >
          Default markup %
        </Label>
        <Input
          id="default-markup"
          type="number"
          min="0"
          step="0.01"
          disabled={!loaded}
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
        {error ? <p className="text-[11px] font-medium text-destructive">{error}</p> : null}
        <p className="text-[11px] text-muted-foreground">
          Prefilled on new draft customer quotes unless the client has a special markup.
        </p>
      </div>
      <Button type="submit" disabled={saving || !loaded}>
        {saving ? <Loader2 className="size-4 animate-spin" /> : null}
        Save default
      </Button>
    </form>
  );
}

const COMPANY_FIELDS = [
  ["legal_name", "Legal name"],
  ["trade_name", "Trade name"],
  ["gstin", "GSTIN"],
  ["address", "Address"],
  ["state", "State"],
  ["phone", "Phone"],
  ["email", "Email"],
  ["bank_name", "Bank"],
  ["bank_account_name", "Account name"],
  ["bank_account_number", "Account number"],
  ["bank_ifsc", "IFSC"],
  ["upi_id", "UPI ID"],
  ["invoice_prefix", "Invoice number prefix"],
] as const;

type CompanyKey = (typeof COMPANY_FIELDS)[number][0] | "logo_path";

function CompanySettingsEditor() {
  const save = useServerFn(updateCompanySettings);
  const [form, setForm] = useState<Record<CompanyKey, string>>({} as Record<CompanyKey, string>);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    void supabase
      .from("company_settings")
      .select("*")
      .maybeSingle()
      .then(({ data }) => {
        const next = {} as Record<CompanyKey, string>;
        for (const [key] of COMPANY_FIELDS) next[key] = (data?.[key] as string | null) ?? "";
        next.logo_path = data?.logo_path ?? "";
        if (!next.invoice_prefix) next.invoice_prefix = "INV";
        setForm(next);
        setLoaded(true);
      });
  }, []);

  async function uploadLogo(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("Choose an image file");
      return;
    }
    setUploading(true);
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
    const path = `logo/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("company-assets").upload(path, file, {
      contentType: file.type,
    });
    setUploading(false);
    if (error) {
      toast.error("Could not upload the logo", { description: error.message });
      return;
    }
    setForm((f) => ({ ...f, logo_path: path }));
    toast.success("Logo uploaded — click Save company details to keep it");
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await save({ data: form });
      toast.success("Company details saved");
    } catch (error) {
      toast.error("Could not save company details", { description: (error as Error).message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSave}
      className="max-w-xl space-y-4 rounded-lg border border-border bg-surface p-5 shadow-panel"
    >
      <h2 className="text-sm font-semibold text-foreground">Company details (for invoices)</h2>
      <p className="text-[11px] text-muted-foreground">
        Legal name, GSTIN, address and state are required before invoices can be issued.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {COMPANY_FIELDS.map(([key, label]) => (
          <div
            key={key}
            className={key === "address" ? "space-y-1.5 sm:col-span-2" : "space-y-1.5"}
          >
            <Label
              htmlFor={`co-${key}`}
              className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground"
            >
              {label}
            </Label>
            <Input
              id={`co-${key}`}
              disabled={!loaded}
              value={form[key] ?? ""}
              onChange={(event) => setForm({ ...form, [key]: event.target.value })}
            />
          </div>
        ))}
        <div className="space-y-1.5 sm:col-span-2">
          <Label
            htmlFor="co-logo"
            className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground"
          >
            Logo
          </Label>
          <Input
            id="co-logo"
            type="file"
            accept="image/*"
            disabled={!loaded || uploading}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void uploadLogo(file);
            }}
          />
          <p className="text-[11px] text-muted-foreground">
            {form.logo_path ? "A logo is set." : "No logo yet."} Max 2 MB.
          </p>
        </div>
      </div>
      <Button type="submit" disabled={saving || !loaded || uploading}>
        {saving ? <Loader2 className="size-4 animate-spin" /> : null}
        Save company details
      </Button>
    </form>
  );
}
