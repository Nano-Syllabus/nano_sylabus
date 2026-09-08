"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { loadSupabaseBrowserClient, warmSupabaseBrowserClient } from "@/lib/supabase/browser-lazy";

export function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    const supabase = await loadSupabaseBrowserClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setNotice("Password updated. You can continue to the app or log in again later.");
    router.replace("/app/chat");
    router.refresh();
  }

  return (
    <AuthShell title="Choose a new password" subtitle="This will replace your old password immediately.">
      <form onSubmit={onSubmit} onFocus={warmSupabaseBrowserClient} className="space-y-4">
        <Field label="New password">
          <Input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
            required
          />
        </Field>
        <Field label="Confirm new password" error={error || undefined}>
          <Input
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="••••••••"
            invalid={Boolean(error)}
            required
          />
        </Field>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Updating..." : "Update password"}
        </Button>
      </form>

      {notice ? <p className="mt-4 text-sm text-text-secondary">{notice}</p> : null}

      <p className="mt-6 text-center text-sm text-text-secondary">
        Need to start over?{" "}
        <Link href="/login" className="font-medium text-text-primary underline underline-offset-4">
          Back to login
        </Link>
      </p>
    </AuthShell>
  );
}
