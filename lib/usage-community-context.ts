import { AsyncLocalStorage } from "node:async_hooks";

/**
 * The community a request's backend calls are spending tokens for, set by
 * `withUsageCommunity` (lib/usage-community.ts). Its own module, free of
 * Next.js imports, because the backend clients read it and they are loaded by
 * plain unit tests too.
 */
export const usageCommunityStorage = new AsyncLocalStorage<string>();

/** Header for the backend clients: `{}` outside a tagged request. */
export function usageCommunityHeader(): Record<string, string> {
  const slug = usageCommunityStorage.getStore();
  return slug ? { "X-NSDI-Community": slug } : {};
}
