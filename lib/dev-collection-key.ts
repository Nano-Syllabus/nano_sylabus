/**
 * Development-only override for a creator's collection key.
 *
 * WHAT BREAKS WITHOUT IT
 * ----------------------
 * The challenge routes authenticate as the CREATOR, not as the app: every call to
 * `/v1/collection/challenge/*` sends `Authorization: Bearer <collection_sk>`, and
 * that key is read from `teachers.collection_sk` in Supabase.
 *
 * Supabase is the production project even when the tenant API is local. So a
 * local run reads a key that production issued, sends it to an api-service that
 * has never heard of it, and gets back `401 {"detail":"invalid tenant API key"}`.
 * The Challenge Hub still renders — the list comes from Supabase directly — and
 * only fails at "Start Challenge", which is exactly where the tenant API is first
 * touched, and is why this looks like a challenge bug rather than a wiring one.
 *
 * Pointing `TENANT_API_BASE_URL` at localhost is therefore only half the switch.
 * This is the other half: the key has to move with the backend it authenticates
 * against.
 *
 * SAFE BY CONSTRUCTION, the same three conditions as `DEV_AUTH_BYPASS`
 * -------------------------------------------------------------------
 * - not a production build (`next build` pins NODE_ENV=production, so this is
 *   compiled out of anything shipped);
 * - not on Vercel (`process.env.VERCEL` is set on every deployment, previews
 *   included, so a stray dashboard value is inert);
 * - `DEV_COLLECTION_KEY` has to be set explicitly, has no `NEXT_PUBLIC_` prefix,
 *   and is absent from `.env` — only `.env.local`, which is not committed.
 *
 * It substitutes the key ONLY. Access checks, course membership and every
 * Supabase read are untouched, so this cannot widen what a student may open — it
 * changes which backend believes the creator, not which creator they are.
 */
const PRODUCTION_BUILD = process.env.NODE_ENV === "production";
const DEPLOYED = Boolean(process.env.VERCEL);

export const DEV_COLLECTION_KEY =
  !PRODUCTION_BUILD && !DEPLOYED ? process.env.DEV_COLLECTION_KEY?.trim() || "" : "";

let warned = false;

/** The dev key, or "" when the override is off. Warns once so a local run says
 *  plainly that its challenges are talking to a different collection. */
export function devCollectionKey(): string {
  if (DEV_COLLECTION_KEY && !warned) {
    warned = true;
    console.warn(
      `\n  ⚠  DEV_COLLECTION_KEY is on — every challenge authenticates against the ` +
        `local tenant API\n     as ${DEV_COLLECTION_KEY.slice(0, 14)}…, not as the creator's own ` +
        `collection.\n     This is refused on Vercel and in production builds.\n`,
    );
  }
  return DEV_COLLECTION_KEY;
}
