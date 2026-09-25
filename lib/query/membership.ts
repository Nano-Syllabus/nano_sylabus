"use client";

import { clearPersistedCache } from "@/components/query-provider";
import { resetQueryClient } from "@/lib/query/client";

/**
 * JOINING OR LEAVING A COMMUNITY CHANGES WHAT EVERY SCREEN MAY SHOW.
 *
 * The cache-first rule (paint from the browser copy, reconcile once per page
 * load, writes patch) rests on the student's data only moving when they act.
 * A membership change is that act, but it is not a few values: the dashboard,
 * the hub, Revision, the Library and the chat's subject list are all scoped to
 * the community, and there is no patch smaller than "forget it". The dashboard
 * query in particular is `staleTime: Infinity` and ignores the server's
 * `initialData` once an entry exists, so without this the left community's
 * dashboard stayed on /app/today until a full reload.
 *
 * So it is treated like a small sign-out: the in-memory cache and its disk copy
 * are dropped, module caches listening for the event (the hub's per-semester
 * copies) drop theirs, and other open tabs are told to do the same — otherwise
 * their in-memory copy would be written straight back to disk by the persister.
 * Removing is not invalidating: nothing is refetched here; a mounted query
 * simply loads its fresh copy the way a first visit does.
 */
export const MEMBERSHIP_CHANGED_EVENT = "ns:community-membership-changed";
const CHANNEL = "ns-community-membership";

/** Remembered picks that can name a subject of the community just left. The
 *  chat would keep asking about it; Revision would fall back, but late. */
const SUBJECT_PICKS = ["padhai:selected_subject", "ns-revision-subject"];

function forgetLocally() {
  resetQueryClient();
  clearPersistedCache();
  try {
    for (const key of SUBJECT_PICKS) window.localStorage.removeItem(key);
  } catch {
    /* no storage, nothing remembered */
  }
  window.dispatchEvent(new Event(MEMBERSHIP_CHANGED_EVENT));
}

export function forgetCommunityScopedCaches() {
  forgetLocally();
  try {
    const channel = new BroadcastChannel(CHANNEL);
    channel.postMessage("changed");
    channel.close();
  } catch {
    /* no BroadcastChannel: other tabs reconcile on their next load */
  }
}

let listening = false;

/** Other tabs follow this one. Idempotent; safe to call from any client module. */
export function listenForMembershipChanges() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  try {
    const channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = () => forgetLocally();
  } catch {
    /* as above */
  }
}
