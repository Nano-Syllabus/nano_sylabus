"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { loadSupabaseBrowserClient, warmSupabaseBrowserClient } from "@/lib/supabase/browser-lazy";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    setLoading(true);

    const supabase = await loadSupabaseBrowserClient();
    const redirectTo =
      typeof window !== "undefined" ? `${window.location.origin}/reset-password` : undefined;
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });

    setLoading(false);

    if (resetError) {
      setError(resetError.message);
      return;
    }

    setNotice("Password reset email sent. Open the link in your inbox to continue.");
  }

  return (
    <AuthShell title="Reset your password" subtitle="We’ll send you a secure recovery link.">
      <form onSubmit={onSubmit} onFocus={warmSupabaseBrowserClient} className="space-y-4">
        <Field label="Email" error={error || undefined}>
          <Input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@school.edu.np"
            required
          />
        </Field>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Sending..." : "Send reset link"}
        </Button>
      </form>

      {notice ? <p className="mt-4 text-sm text-text-secondary">{notice}</p> : null}

      <p className="mt-6 text-center text-sm text-text-secondary">
        Remembered it?{" "}
        <Link href="/login" className="font-medium text-text-primary underline underline-offset-4">
          Back to login
        </Link>
      </p>
    </AuthShell>
  );
}
