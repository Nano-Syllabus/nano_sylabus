export type AdminSurfaceKey =
  | "home"
  | "notebooks"
  | "answers"
  | "students"
  | "payments"
  | "instructions";

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
    subtitle: "Daily control room for notebooks, answers, students, payments, and live AI instructions.",
    icon: "🏠",
  },
  {
    key: "notebooks",
    href: "/admin/knowledge",
    navLabel: "Notebooks",
    pageTitle: "Notebooks",
    subtitle: "Create notebooks by board, level, faculty, and subject. Then add syllabus, study material, and question bank resources under each notebook.",
    icon: "📚",
  },
  {
    key: "answers",
    href: "/admin/answers",
    navLabel: "Answers",
    pageTitle: "Answers",
    subtitle: "Inspect student conversations, audit grounded sources, and review flagged assistant answers from one place.",
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
  {
    key: "instructions",
    href: "/admin/prompts",
    navLabel: "AI Instructions",
    pageTitle: "AI Instructions",
    subtitle: "Change the live AI instructions. One active template per purpose and language shapes student answers.",
    icon: "✍️",
  },
];

export function getAdminSurfaceByHref(href: string) {
  return ADMIN_SURFACES.find((surface) => surface.href === href) ?? null;
}
