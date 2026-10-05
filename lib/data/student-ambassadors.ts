import { cache } from "react";
import { memo } from "@/lib/http/memo";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Student ambassadors are the only people who may create faculties. A super
 * admin adds an email, even before that person has an account; the check is by
 * the signed-in account's email, compared lower-cased.
 */
export const normalizeAmbassadorEmail = (value: string) => value.trim().toLowerCase();

export const isStudentAmbassador = cache(async (email: string | null | undefined) => {
  const address = normalizeAmbassadorEmail(email ?? "");
  if (!address) return false;
  const { data, error } = await createSupabaseAdminClient()
    .from("student_ambassadors")
    .select("email")
    .eq("email", address)
    .maybeSingle();
  // A failed lookup is "not known to be an ambassador", never a way in.
  if (error) {
    console.error("[student-ambassadors] lookup failed", error);
    return false;
  }
  return Boolean(data);
});

/**
 * For menus and labels, which ask on every page: remembered for a minute so the
 * app shell does not run a query per navigation. Anything that GRANTS the power
 * (creating a faculty, opening a workspace) uses `isStudentAmbassador`, which is
 * always fresh, so a removed ambassador loses it at once.
 */
export function isStudentAmbassadorCached(email: string | null | undefined) {
  const address = normalizeAmbassadorEmail(email ?? "");
  if (!address) return Promise.resolve(false);
  return memo(`student-ambassador:${address}`, () => isStudentAmbassador(address), {
    ttlSeconds: 60,
    staleSeconds: 300,
  });
}

export type AmbassadorRow = { email: string; addedAt: string; hasAccount: boolean };

export async function listStudentAmbassadors(): Promise<AmbassadorRow[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("student_ambassadors")
    .select("email, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = data ?? [];
  // "Has an account" tells the admin whether the person can already sign in as an ambassador.
  const known = new Set<string>();
  for (let page = 1; page <= 20; page += 1) {
    const { data: list, error: listError } = await admin.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (listError) break;
    for (const user of list.users) if (user.email) known.add(user.email.toLowerCase());
    if (list.users.length < 1000) break;
  }
  return rows.map((row) => ({
    email: row.email,
    addedAt: row.created_at,
    hasAccount: known.has(row.email),
  }));
}

export async function addStudentAmbassador(email: string, addedBy: string) {
  const { error } = await createSupabaseAdminClient()
    .from("student_ambassadors")
    .upsert({ email: normalizeAmbassadorEmail(email), added_by: addedBy }, { onConflict: "email" });
  if (error) throw error;
}

export async function removeStudentAmbassador(email: string) {
  const { error } = await createSupabaseAdminClient()
    .from("student_ambassadors")
    .delete()
    .eq("email", normalizeAmbassadorEmail(email));
  if (error) throw error;
}
