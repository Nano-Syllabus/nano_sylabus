import Link from "next/link";
import { Check, ExternalLink, Minus } from "lucide-react";
import type { FacultyOverview, FacultyPerson } from "@/lib/data/faculty-managers";

const card = "rounded-xl border border-border bg-card";
const tag =
  "inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground";
const blueTag =
  "inline-flex items-center rounded-full bg-blue-600/10 px-2 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300";

/**
 * What each kind of person may do to a faculty. Mirrors the server rules: the
 * creator works from the Creator Workspace, a subdomain admin from the admin
 * panel (lib/admin-scope.ts), a super admin anywhere.
 */
const ABILITIES = [
  "Add subjects & files",
  "Publish subjects",
  "Edit faculty",
  "Move students",
  "Link to a subdomain",
] as const;
const RULES: Array<{
  who: "creator" | "admins" | "super" | "students";
  label: string;
  can: boolean[];
  note: string;
}> = [
  {
    who: "creator",
    label: "Creator (owner)",
    can: [true, true, true, false, false],
    note: "From the Creator Workspace. Can hand ownership to a member by email.",
  },
  {
    who: "admins",
    label: "Subdomain admins",
    can: [true, true, true, true, true],
    note: "From this admin panel, only for subdomains they run. They can link only faculties they created.",
  },
  {
    who: "super",
    label: "Super admins",
    can: [true, true, true, true, true],
    note: "Every faculty and subdomain.",
  },
  {
    who: "students",
    label: "Students",
    can: [false, false, false, false, false],
    note: "Can suggest PDFs from the Library; each is checked before it is added.",
  },
];

export function AdminFacultyOverview({ faculty }: { faculty: FacultyOverview }) {
  const peopleFor = (who: (typeof RULES)[number]["who"]): FacultyPerson[] =>
    who === "creator"
      ? faculty.creator
        ? [faculty.creator]
        : []
      : who === "admins"
        ? faculty.siteAdmins
        : who === "super"
          ? faculty.superAdmins
          : [];

  return (
    <div className="mt-6 space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Members" value={faculty.members} />
        <Stat
          label="Subjects"
          value={faculty.subjects.total}
          hint={`${faculty.subjects.published} published`}
        />
        <Stat
          label="Subdomains"
          value={faculty.sites.length}
          warn={!faculty.sites.length}
          hint={faculty.sites.length ? undefined : "Not on any site"}
        />
        <Stat
          label="Admins"
          value={faculty.siteAdmins.length}
          warn={!faculty.siteAdmins.length}
          hint={faculty.siteAdmins.length ? undefined : "Only super admins"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className={card}>
          <h2 className="border-b border-border px-4 py-3 text-sm font-semibold">Subdomains</h2>
          {faculty.sites.length ? (
            <ul className="divide-y divide-border">
              {faculty.sites.map((site) => (
                <li key={site.slug} className="flex flex-wrap items-center gap-2 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{site.name}</div>
                    <div className="text-xs text-muted-foreground">{site.slug}</div>
                  </div>
                  <span className={site.status === "live" ? blueTag : tag}>
                    {site.status === "live" ? "Live" : "Hidden"}
                  </span>
                  {!site.examEnabled ? (
                    <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                      Faculty flow off
                    </span>
                  ) : null}
                  <Link
                    href={`/admin/sites/${site.slug}`}
                    className="inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-blue-700 hover:bg-blue-600/10 dark:text-blue-300"
                  >
                    Open <ExternalLink size={12} aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-4 text-sm text-muted-foreground">
              No subdomain lists this faculty. Link it from Websites → Faculties → Manage.
            </p>
          )}
        </section>

        <section className={card}>
          <h2 className="border-b border-border px-4 py-3 text-sm font-semibold">Managed by</h2>
          <ul className="divide-y divide-border">
            {faculty.creator ? (
              <PersonRow person={faculty.creator} badge="Creator · owner">
                {faculty.creator.ambassador ? (
                  <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                    Ambassador
                  </span>
                ) : null}
              </PersonRow>
            ) : null}
            {faculty.siteAdmins.map((admin) => (
              <PersonRow
                key={`${admin.site.slug}:${admin.userId}`}
                person={admin}
                badge={`Admin · ${admin.site.name}`}
                blue
              />
            ))}
            {!faculty.creator && !faculty.siteAdmins.length ? (
              <li className="px-4 py-4 text-sm text-amber-700 dark:text-amber-300">
                Only super admins manage this faculty.
              </li>
            ) : null}
          </ul>
        </section>
      </div>

      <section className={card}>
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">Who can add to this faculty</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            What each role may change, and who holds it today.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-border text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Role</th>
                {ABILITIES.map((ability) => (
                  <th key={ability} className="px-2 py-2.5 text-center font-medium">
                    {ability}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {RULES.map((rule) => {
                const people = peopleFor(rule.who);
                return (
                  <tr key={rule.who} className="align-top">
                    <td className="px-4 py-3">
                      <div className="font-medium">{rule.label}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {rule.who === "students"
                          ? `${faculty.members} members`
                          : people.length
                            ? people.map((person) => person.fullName).join(", ")
                            : "Nobody yet"}
                      </div>
                      <div className="mt-1 max-w-xs text-xs text-muted-foreground">{rule.note}</div>
                    </td>
                    {rule.can.map((allowed, index) => (
                      <td key={ABILITIES[index]} className="px-2 py-3 text-center">
                        {allowed ? (
                          <Check
                            size={16}
                            className="mx-auto text-emerald-600"
                            aria-label="Allowed"
                          />
                        ) : (
                          <Minus
                            size={16}
                            className="mx-auto text-muted-foreground/50"
                            aria-label="Not allowed"
                          />
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="border-t border-border px-4 py-3">
          <h3 className="text-xs font-semibold text-muted-foreground">
            Who has actually added subjects
          </h3>
          {faculty.contributors.length ? (
            <ul className="mt-2 flex flex-wrap gap-2">
              {faculty.contributors.map((person) => (
                <li
                  key={person.userId}
                  className="rounded-lg border border-border px-3 py-1.5 text-sm"
                  title={person.email || undefined}
                >
                  <span className="font-medium">{person.fullName}</span>
                  <span className="ml-1.5 text-xs text-muted-foreground">
                    {person.subjectsAdded} subject{person.subjectsAdded === 1 ? "" : "s"} added
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">No subjects recorded yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}

function PersonRow({
  person,
  badge,
  blue,
  children,
}: {
  person: FacultyPerson;
  badge: string;
  blue?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-medium">{person.fullName}</span>
        <span className={blue ? blueTag : tag}>{badge}</span>
        {children}
      </div>
      {person.email ? <div className="text-xs text-muted-foreground">{person.email}</div> : null}
    </li>
  );
}

function Stat({
  label,
  value,
  hint,
  warn,
}: {
  label: string;
  value: number;
  hint?: string;
  warn?: boolean;
}) {
  return (
    <div className={`${card} px-4 py-3`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={`mt-1 font-display text-2xl font-semibold tabular-nums ${
          warn ? "text-amber-700 dark:text-amber-300" : "text-foreground"
        }`}
      >
        {value}
      </div>
      {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}
