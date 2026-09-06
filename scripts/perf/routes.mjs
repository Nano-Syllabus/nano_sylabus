/**
 * The screens we hold to a latency budget.
 *
 * `auth: true` means the route sits behind the middleware gate, so the harness
 * has to sign in before it can be measured — an unauthenticated hit just
 * redirects to /login and would report the login page's numbers instead.
 */
export const ROUTES = [
  { path: "/", name: "landing", auth: false },
  { path: "/login", name: "login", auth: false },
  { path: "/signup", name: "signup", auth: false },
  { path: "/app/today", name: "today", auth: true },
  { path: "/app/chat", name: "chat", auth: true },
  { path: "/app/notes", name: "notes", auth: true },
  { path: "/app/explore", name: "explore", auth: true },
  { path: "/app/challenges", name: "challenges", auth: true },
  { path: "/app/communities", name: "communities", auth: true },
  { path: "/app/exams", name: "exams", auth: true },
  { path: "/app/billing", name: "billing", auth: true },
  { path: "/app/settings", name: "settings", auth: true },
];

export function selectRoutes(only) {
  if (!only) return ROUTES;
  const wanted = new Set(only.split(",").map((value) => value.trim()).filter(Boolean));
  return ROUTES.filter((route) => wanted.has(route.name) || wanted.has(route.path));
}
