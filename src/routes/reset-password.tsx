import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Set a new password — Triptastic Ops" },
      {
        name: "description",
        content: "Choose a new password for your Triptastic Holidays operations account.",
      },
      { property: "og:title", content: "Set a new password — Triptastic Ops" },
      {
        property: "og:description",
        content: "Choose a new password for your Triptastic Holidays operations account.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPasswordPage,
});

const schema = z
  .object({
    password: z.string().min(8, "Use at least 8 characters"),
    confirm: z.string(),
  })
  .refine((values) => values.password === values.confirm, {
    path: ["confirm"],
    message: "Passwords do not match",
  });

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Supabase turns the recovery link into a session on this page; wait for it
  // before allowing the password to be changed.
  useEffect(() => {
    let cancelled = false;

    const { data: subscription } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });

    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) setReady(true);
      else
        setFormError(
          "This reset link is invalid or has expired. Request a new one from the sign-in page.",
        );
    })();

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    const parsed = schema.safeParse({ password, confirm });
    if (!parsed.success) {
      const flat = parsed.error.flatten().fieldErrors;
      setErrors({
        ...(flat.password?.[0] ? { password: flat.password[0] } : {}),
        ...(flat.confirm?.[0] ? { confirm: flat.confirm[0] } : {}),
      });
      return;
    }

    setErrors({});
    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
    setSubmitting(false);

    if (error) {
      setFormError(error.message);
      return;
    }

    toast.success("Password updated");
    navigate({ to: "/dashboard", replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12 font-sans">
      <div className="w-full max-w-sm">
        <div className="text-center">
          <h1 className="text-lg font-bold tracking-tight text-foreground">Set a new password</h1>
          <p className="mt-1 text-xs uppercase tracking-widest text-muted-foreground">
            Triptastic Holidays LLP
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="mt-8 space-y-4 rounded-lg border border-border bg-surface p-6 shadow-panel"
          noValidate
        >
          <div className="space-y-1.5">
            <Label
              htmlFor="password"
              className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground"
            >
              New password
            </Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-invalid={Boolean(errors.password)}
            />
            {errors.password ? (
              <p className="text-[11px] font-medium text-destructive">{errors.password}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label
              htmlFor="confirm"
              className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground"
            >
              Confirm password
            </Label>
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              aria-invalid={Boolean(errors.confirm)}
            />
            {errors.confirm ? (
              <p className="text-[11px] font-medium text-destructive">{errors.confirm}</p>
            ) : null}
          </div>

          {formError ? (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-xs text-destructive">
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
              <span className="font-medium">{formError}</span>
            </div>
          ) : null}

          <Button type="submit" className="w-full" disabled={submitting || !ready}>
            {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
            Update password
          </Button>

          <button
            type="button"
            onClick={() => navigate({ to: "/auth", replace: true })}
            className="w-full text-center text-[11px] font-medium text-muted-foreground underline-offset-2 hover:underline"
          >
            Back to sign in
          </button>
        </form>
      </div>
    </div>
  );
}
