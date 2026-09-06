/**
 * Production stand-in for `components/dev-perf-hud`.
 *
 * `next.config.ts` aliases the real HUD to this file in production builds, so
 * none of its code reaches a user's browser. Rendering is already guarded in
 * `app/layout.tsx`; this makes the guarantee structural rather than a bet on
 * the bundler folding a constant.
 */
export function DevPerfHud() {
  return null;
}

export default DevPerfHud;
