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
            className="w-full flex items-center justify-center gap-2"
            onClick={() => void continueWithGoogle()}
            disabled={googleLoading || loading}
          >
            {!googleLoading && (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
            )}
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
              className="pr-16"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              className="absolute right-1.5 top-1/2 inline-flex min-h-10 min-w-12 -translate-y-1/2 items-center justify-center rounded-full text-xs font-mono-ui text-text-muted transition hover:bg-bg-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong/70"
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
          className="inline-flex min-h-10 items-center font-medium text-text-primary underline underline-offset-4"
        >
          Forgot password?
        </Link>
      </p>

      <p className="mt-6 text-center text-sm text-text-secondary">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="inline-flex min-h-10 items-center font-medium text-text-primary underline underline-offset-4">
          Sign up
        </Link>
      </p>
    </AuthShell>
  );
}
