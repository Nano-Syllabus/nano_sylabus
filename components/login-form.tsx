"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { AuthShell, DividerOr } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function LoginForm({
  nextPath,
  initialError = "",
}: {
  nextPath?: string;
  initialError?: string;
}) {
  const googleAuthEnabled = process.env.NEXT_PUBLIC_ENABLE_GOOGLE_AUTH === "true";
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(initialError);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  async function resolveDestination() {
    const query = nextPath ? `?next=${encodeURIComponent(nextPath)}` : "";
    const response = await fetch(`/api/auth/destination${query}`);
    const payload = (await response.json()) as { destination?: string; error?: string };
    if (!response.ok || !payload.destination) {
      throw new Error(payload.error || "Failed to resolve your destination.");
    }
    return payload.destination;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);

    const supabase = createSupabaseBrowserClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (authError) {
      setError(authError.message);
      return;
    }

    try {
      const destination = await resolveDestination();
      router.replace(destination);
      router.refresh();
    } catch (destinationError) {
      setError(destinationError instanceof Error ? destinationError.message : "Failed to continue after login.");
    }
  }

  async function continueWithGoogle() {
    if (!googleAuthEnabled) {
      setError("Google sign-in is not enabled yet.");
      return;
    }

    setError("");
    setGoogleLoading(true);
    const supabase = createSupabaseBrowserClient();
    const redirectTo =
      typeof window !== "undefined" ? `${window.location.origin}/auth/callback` : undefined;

    if (typeof document !== "undefined") {
      const encodedNext = encodeURIComponent(nextPath || "");
      document.cookie = `oauth_next=${encodedNext}; Path=/; Max-Age=600; SameSite=Lax`;
    }

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
      },
    });

    setGoogleLoading(false);

    if (oauthError) {
      setError(oauthError.message);
    }
  }

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to continue your study sessions.">
      {googleAuthEnabled ? (
        <>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => void continueWithGoogle()}
            disabled={googleLoading || loading}
          >
            {googleLoading ? "Redirecting..." : "Continue with Google"}
          </Button>

          <DividerOr />
        </>
      ) : null}

      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Email">
          <Input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@school.edu.np"
            required
          />
        </Field>
        <Field label="Password" error={error || undefined}>
          <div className="relative">
            <Input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              invalid={Boolean(error)}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono-ui text-text-muted hover:text-text-primary"
            >
              {showPassword ? "HIDE" : "SHOW"}
            </button>
          </div>
        </Field>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Logging in..." : "Login"}
        </Button>
      </form>

      <p className="mt-4 text-center text-sm text-text-secondary">
        <Link
          href="/forgot-password"
          className="font-medium text-text-primary underline underline-offset-4"
        >
          Forgot password?
        </Link>
      </p>

      <p className="mt-6 text-center text-sm text-text-secondary">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="font-medium text-text-primary underline underline-offset-4">
          Sign up
        </Link>
      </p>
    </AuthShell>
  );
}
