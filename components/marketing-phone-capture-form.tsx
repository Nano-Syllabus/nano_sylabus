"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { marketingPhoneError, normalizeMarketingPhone } from "@/lib/marketing-phone";
import { loadSupabaseBrowserClient } from "@/lib/supabase/browser-lazy";

export function MarketingPhoneCaptureForm({ nextPath }: { nextPath: string }) {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [phoneError, setPhoneError] = useState("");
  const [consentError, setConsentError] = useState("");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPhoneError("");
    setConsentError("");
    setFormError("");

    const nextPhoneError = marketingPhoneError(phone);
    if (nextPhoneError) {
      setPhoneError(nextPhoneError);
      return;
    }
    if (!consent) {
      setConsentError("Please confirm that we can send updates to this number.");
      return;
    }

    setSaving(true);
    const supabase = await loadSupabaseBrowserClient();
    const { error } = await supabase.auth.updateUser({
      data: {
        marketing_phone: normalizeMarketingPhone(phone),
        marketing_phone_marketing_opt_in: true,
      },
    });
    setSaving(false);

    if (error) {
      setFormError(error.message);
      return;
    }

    router.replace(nextPath);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-5" aria-busy={saving}>
      <div className="space-y-3">
        <label
          htmlFor="oauth-marketing-phone"
          className="block text-xs font-medium uppercase tracking-wider text-text-secondary"
        >
          Phone number
        </label>
        <Input
          id="oauth-marketing-phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          spellCheck={false}
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          placeholder="9812345678 or +977 9812345678"
          invalid={Boolean(phoneError)}
          aria-describedby={phoneError ? "oauth-marketing-phone-error" : undefined}
          required
        />
        {phoneError ? (
          <p id="oauth-marketing-phone-error" role="alert" className="text-xs text-destructive">
            {phoneError}
          </p>
        ) : (
          <p className="text-xs text-text-muted">
            We’ll use this for Nano Syllabus study updates and occasional offers.
          </p>
        )}
      </div>

      <fieldset className="space-y-2">
        <legend className="sr-only">Marketing consent</legend>
        <label className="flex cursor-pointer items-start gap-3 text-sm text-text-secondary">
          <input
            id="oauth-marketing-consent"
            type="checkbox"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
            className="mt-0.5 size-4 shrink-0 rounded border-border text-text-primary focus-visible:ring-2 focus-visible:ring-border-strong/40"
            aria-invalid={consentError ? "true" : undefined}
            aria-describedby={consentError ? "oauth-marketing-consent-error" : undefined}
          />
          <span>I agree to receive Nano Syllabus updates and offers by SMS or WhatsApp.</span>
        </label>
        {consentError ? (
          <p id="oauth-marketing-consent-error" role="alert" className="text-xs text-destructive">
            {consentError}
          </p>
        ) : null}
      </fieldset>

      {formError ? (
        <p role="alert" className="text-sm text-destructive">
          {formError}
        </p>
      ) : null}

      <Button type="submit" className="w-full" disabled={saving}>
        {saving ? "Saving phone number..." : "Continue"}
      </Button>
    </form>
  );
}
