export type AdminSurfaceKey =
  | "home"
  | "answers"
  | "students"
  | "payments";

export interface AdminSurfaceDefinition {
  key: AdminSurfaceKey;
  href: string;
  navLabel: string;
  pageTitle: string;
  subtitle: string;
  icon: string;
}

export const ADMIN_SURFACES: AdminSurfaceDefinition[] = [
  {
    key: "home",
    href: "/admin",
    navLabel: "Home",
    pageTitle: "Home",
    subtitle: "Daily control room for answers, students, and payments.",
    icon: "🏠",
  },
  {
    key: "answers",
    href: "/admin/answers",
    navLabel: "Answers",
    pageTitle: "Answers",
    subtitle: "Inspect student conversations and review flagged assistant answers from one place.",
    icon: "🤖",
  },
  {
    key: "students",
    href: "/admin/users",
    navLabel: "Students",
    pageTitle: "Students",
    subtitle: "Search users, inspect academic context, change roles, and adjust credits without touching the database directly.",
    icon: "👥",
  },
  {
    key: "payments",
    href: "/admin/billing",
    navLabel: "Payments",
    pageTitle: "Payments",
    subtitle: "Review manual payments, manage plans, and control active student subscriptions from one place.",
    icon: "🧾",
  },
];

export function getAdminSurfaceByHref(href: string) {
  return ADMIN_SURFACES.find((surface) => surface.href === href) ?? null;
}
