"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { AuthShell, DividerOr } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

function passwordStrength(password: string) {
  let score = 0;
  if (password.length >= 8) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/\d/.test(password) && /[^\w\s]/.test(password)) score++;
  return {
    score: score as 0 | 1 | 2 | 3,
    label: ["Too short", "Weak", "Medium", "Strong"][score],
  };
}

export function SignupForm() {
  const googleAuthEnabled = process.env.NEXT_PUBLIC_ENABLE_GOOGLE_AUTH === "true";
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const strength = passwordStrength(password);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (password !== password2) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    setError("");
    setNotice("");

    const supabase = createSupabaseBrowserClient();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: name,
        },
      },
    });

    setLoading(false);

    if (signUpError) {
      setError(signUpError.message);
      return;
    }

    if (data.session) {
      router.replace("/app/chat");
      router.refresh();
      return;
    }

    setNotice("Account created. If email confirmation is enabled, confirm your email first and then log in.");
  }

  async function continueWithGoogle() {
    if (!googleAuthEnabled) {
      setError("Google sign-in is not enabled yet.");
      return;
    }

    setError("");
    setNotice("");
    setGoogleLoading(true);

    const supabase = createSupabaseBrowserClient();
    const redirectTo =
      typeof window !== "undefined"
        ? `${window.location.origin}/auth/callback?next=${encodeURIComponent("/app/chat")}`
        : undefined;

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
    <AuthShell title="Create your account" subtitle="Start with a real AI study workspace.">
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
        <Field label="Full name">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Pratiksha Rai"
            required
          />
        </Field>
        <Field label="Email">
          <Input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@school.edu.np"
            required
          />
        </Field>
        <Field label="Password">
          <Input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
            required
          />
          <div className="mt-2 flex gap-1">
            {[0, 1, 2].map((index) => (
              <span
                key={index}
                className={
                  "h-1 flex-1 rounded-full " +
                  (index < strength.score
                    ? strength.score === 1
                      ? "bg-destructive"
                      : strength.score === 2
                        ? "bg-warning"
                        : "bg-success"
                    : "bg-bg-tertiary")
                }
              />
            ))}
          </div>
          <span className="mt-1 block text-[11px] font-mono-ui text-text-muted">
            {strength.label}
          </span>
        </Field>
        <Field label="Confirm password" error={error || undefined}>
          <Input
            type="password"
            value={password2}
            onChange={(event) => setPassword2(event.target.value)}
            placeholder="••••••••"
            invalid={Boolean(error)}
            required
          />
        </Field>

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Creating account..." : "Create account"}
        </Button>
      </form>

      {notice ? <p className="mt-4 text-sm text-text-secondary">{notice}</p> : null}

      <p className="mt-6 text-center text-sm text-text-secondary">
        Already have an account?{" "}
        <Link href="/login" className="inline-flex min-h-10 items-center font-medium text-text-primary underline underline-offset-4">
          Login
        </Link>
      </p>
    </AuthShell>
  );
}
