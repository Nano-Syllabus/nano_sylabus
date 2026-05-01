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
      router.replace("/onboarding");
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
        ? `${window.location.origin}/auth/callback?next=${encodeURIComponent("/onboarding")}`
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
        <Link href="/login" className="font-medium text-text-primary underline underline-offset-4">
          Login
        </Link>
      </p>
    </AuthShell>
  );
}
