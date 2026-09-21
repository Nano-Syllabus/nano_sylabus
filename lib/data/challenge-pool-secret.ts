import { createHmac } from "node:crypto";

/**
 * The secret the timer presents.
 *
 * `CHALLENGE_POOL_SWEEP_SECRET` when the deployment sets one. Otherwise it is
 * DERIVED from the Supabase service key every deployment already has: an HMAC
 * under a fixed label, one-way, so the timer on the VPS holds the derived value
 * and never the service key, and the derived value opens this route and nothing
 * else. That lets the timer run without a new variable in the hosting
 * dashboard. Rotating the service key rotates this too — the timer's env file
 * (`/etc/nano-syllabus/challenge-pool-sweep.env`) then needs the new value.
 */
export function sweepSecret() {
  const explicit = (process.env.CHALLENGE_POOL_SWEEP_SECRET || "").trim();
  if (explicit) return explicit;
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  return serviceKey
    ? createHmac("sha256", serviceKey).update("challenge-pool-sweep:v1").digest("hex")
    : "";
}
