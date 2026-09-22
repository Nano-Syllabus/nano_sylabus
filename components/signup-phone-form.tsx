"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { getPhoneNumberError, normalizePhoneNumber } from "@/lib/phone-number";
import { loadSupabaseBrowserClient, warmSupabaseBrowserClient } from "@/lib/supabase/browser-lazy";

export function SignupPhoneForm({ nextPath }: { nextPath?: string }) {
  const router = useRouter();
  const [phoneNumber, setPhoneNumber] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function resolveDestination() {
    const query = nextPath ? `?next=${encodeURIComponent(nextPath)}` : "";
    const response = await fetch(`/api/auth/destination${query}`);
    const payload = (await response.json()) as { destination?: string; error?: string };
    if (!response.ok || !payload.destination) {
      throw new Error(payload.error || "Failed to continue after signup.");
    }
    return payload.destination;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const validationError = getPhoneNumberError(phoneNumber);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError("");
    setLoading(true);

    try {
      const supabase = await loadSupabaseBrowserClient();
      const { error: updateError } = await supabase.auth.updateUser({
        data: { phone_number: normalizePhoneNumber(phoneNumber) },
      });
      if (updateError) throw updateError;

      router.replace(await resolveDestination());
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save your phone number.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell title="Add your phone number" subtitle="A phone number is required to finish creating your account.">
      <form onSubmit={onSubmit} onFocus={warmSupabaseBrowserClient} className="space-y-4">
        <Field label="Phone number" error={error || undefined}>
          <Input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phoneNumber}
            onChange={(event) => setPhoneNumber(event.target.value)}
            placeholder="9812345678 or +977 9812345678"
            invalid={Boolean(error)}
            required
            autoFocus
          />
        </Field>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Saving..." : "Continue"}
        </Button>
      </form>
    </AuthShell>
  );
}
