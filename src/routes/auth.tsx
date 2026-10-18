import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign in — Triptastic Ops" },
      {
        name: "description",
        content:
          "Secure sign-in for the Triptastic Holidays LLP internal operations and finance system.",
      },
      { property: "og:title", content: "Sign in — Triptastic Ops" },
      {
        property: "og:description",
        content: "Secure sign-in for the Triptastic Holidays internal operations system.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

const schema = z.object({
  email: z.string().trim().min(1, "Email is required").email("Enter a valid work email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

function AuthPage() {
  const { session, signIn, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);

  async function handleForgotPassword() {
    const parsedEmail = z.string().trim().email().safeParse(email);
    if (!parsedEmail.success) {
      setFieldErrors({ email: "Enter your work email first" });
      return;
    }

    setSendingReset(true);
    const { error } = await supabase.auth.resetPasswordForEmail(parsedEmail.data, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setSendingReset(false);

    // The same confirmation is shown either way so the form cannot be used to
    // discover which email addresses have accounts.
    if (error) console.error(error);
    toast.success("If that account exists, a reset link is on its way");
  }

  useEffect(() => {
    if (!loading && session) navigate({ to: "/dashboard", replace: true });
  }, [loading, session, navigate]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) {
      const flat = parsed.error.flatten().fieldErrors;
      setFieldErrors({
        ...(flat.email?.[0] ? { email: flat.email[0] } : {}),
        ...(flat.password?.[0] ? { password: flat.password[0] } : {}),
      });
      return;
    }

    setFieldErrors({});
    setSubmitting(true);
    const { error } = await signIn(parsed.data.email, parsed.data.password);
    setSubmitting(false);

    if (error) {
      setFormError(
        error.toLowerCase().includes("invalid")
          ? "Invalid credentials. Contact your administrator if you need access."
          : error,
      );
      return;
    }

    toast.success("Signed in");
    navigate({ to: "/dashboard", replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12 font-sans">
      <div className="w-full max-w-sm">
        <div className="text-center">
          <div className="mx-auto grid size-10 place-items-center rounded bg-primary">
            <div className="size-4 rounded-full border-2 border-brand" />
          </div>
          <h1 className="mt-5 text-lg font-bold tracking-tight text-foreground">
            Triptastic<span className="text-brand">Ops</span>
          </h1>
          <p className="mt-1 text-xs uppercase tracking-widest text-muted-foreground">
            Internal Operations · Triptastic Holidays LLP
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="mt-8 space-y-4 rounded-lg border border-border bg-surface p-6 shadow-panel"
          noValidate
        >
          <div className="space-y-1.5">
            <Label
              htmlFor="email"
              className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground"
            >
              Work email
            </Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              aria-invalid={Boolean(fieldErrors.email)}
            />
            {fieldErrors.email ? (
              <p className="text-[11px] font-medium text-destructive">{fieldErrors.email}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label
              htmlFor="password"
              className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground"
            >
              Password
            </Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-invalid={Boolean(fieldErrors.password)}
            />
            {fieldErrors.password ? (
              <p className="text-[11px] font-medium text-destructive">{fieldErrors.password}</p>
            ) : null}
            <button
              type="button"
              onClick={handleForgotPassword}
              disabled={sendingReset}
              className="text-[11px] font-medium text-brand underline-offset-2 hover:underline disabled:opacity-60"
            >
              {sendingReset ? "Sending reset link…" : "Forgot your password?"}
            </button>
          </div>

          {formError ? (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-xs text-destructive">
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
              <span className="font-medium">{formError}</span>
            </div>
          ) : null}

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
            Sign in
          </Button>

          <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
            Accounts are created and managed by an administrator. Public registration is disabled.
          </p>
        </form>
      </div>
    </div>
  );
}
