import http from "node:http";
import https from "node:https";

/**
 * The pooled sockets every upstream call to the NSDI backend goes out on.
 *
 * WHY THIS IS ONE MODULE AND NOT ONE PER CLIENT
 * ---------------------------------------------
 * `lib/tenant/client.ts` and `lib/teacher-app/client.ts` both talk to the same
 * host — `TENANT_API_BASE_URL` — over the same scheme, differing only in which
 * bearer key they carry. Two pools would mean two sets of idle sockets to the
 * same origin and, worse, two chances for one of them to be forgotten: the
 * teacher-app client had no pool at all, and three of the four request sites in
 * the tenant client had opted out of the one it defined locally.
 *
 * WHAT IT BUYS
 * ------------
 * Without an agent Node opens a fresh socket per request and closes it after,
 * so every call pays a TCP handshake and — the backend is https — a TLS
 * handshake on top of it before the first request byte leaves. That is roughly
 * three round trips to the VPS, ahead of any work the backend then does.
 *
 * It is worth the most on exactly the path a user is watching: `chatTenantStream`
 * and `askTeacherSubjectStream` are what stand between pressing enter and the
 * first token appearing, and both used to open a cold socket for every message.
 *
 * `maxSockets` is per origin and generous because these are long calls (a chat
 * stream or a grading run holds its socket for the whole answer) and a queue
 * here is invisible latency added to a request the backend has not even seen
 * yet. `keepAliveMsecs` is the idle-probe interval, and `timeout` reaps sockets
 * the far end dropped silently — a stale pooled socket is a request that fails
 * on write and has to be retried, which costs more than the handshake saved.
 */
const AGENT_OPTIONS = {
  keepAlive: true,
  keepAliveMsecs: 15_000,
  maxSockets: 64,
  maxFreeSockets: 16,
  timeout: 60_000,
} as const;

export const httpAgent = new http.Agent(AGENT_OPTIONS);
export const httpsAgent = new https.Agent(AGENT_OPTIONS);

/** The pooled agent for a URL's scheme — pass it straight to `transport.request`. */
export function agentFor(url: URL) {
  return url.protocol === "https:" ? httpsAgent : httpAgent;
}

/** `node:https` for an https URL, `node:http` otherwise. */
export function transportFor(url: URL) {
  return url.protocol === "https:" ? https : http;
}
