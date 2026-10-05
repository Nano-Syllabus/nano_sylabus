import { revalidatePath, revalidateTag, unstable_cache } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  DEFAULT_LANDING_CONTENT,
  sanitizeLandingContent,
  type LandingContent,
} from "@/lib/landing-content";
import { MAIN_SITE_SLUG, RESERVED_SITE_SLUGS, isValidSiteSlug } from "@/lib/landing-site-host";
import { readExamConfig, examConfigSchema, type ExamConfig } from "@/lib/exam-enrollment";

/**
 * Landing sites: one row per subdomain (plus "main", the bare domain), each
 * holding only the page's TEXT. Two copies per row, WordPress-style:
 *
 * - `draft`   — what the admin editor saves as they type; nobody else sees it.
 * - `content` — what the live site shows; replaced only by Publish.
 *
 * The live read is cached per site and tagged, so a visitor never waits on
 * Supabase, and Publish clears exactly that site's tag. If the table is
 * missing or Supabase is down, the page renders its default wording rather
 * than failing: the landing page must never be the thing that breaks.
 */

export type LandingSiteStatus = "live" | "hidden";

export type LandingSiteSummary = {
  slug: string;
  name: string;
  status: LandingSiteStatus;
  hasUnpublishedChanges: boolean;
  publishedAt: string | null;
  updatedAt: string;
};

export type LandingSiteDetail = LandingSiteSummary & {
  draft: LandingContent;
  content: LandingContent;
  examConfig: ExamConfig;
};

type LandingSiteRow = {
  slug: string;
  name: string;
  status: LandingSiteStatus;
  content: unknown;
  draft: unknown;
  published_at: string | null;
  updated_at: string;
  exam_config?: unknown;
};

const TABLE = "landing_sites";
const COLUMNS = "slug, name, status, content, draft, published_at, updated_at, exam_config";

export function landingSiteTag(slug: string) {
  return `landing-site:${slug}`;
}

function toDetail(row: LandingSiteRow): LandingSiteDetail {
  const content = sanitizeLandingContent(row.content);
  const draft = row.draft == null ? content : sanitizeLandingContent(row.draft);
  return {
    slug: row.slug,
    name: row.name,
    status: row.status === "hidden" ? "hidden" : "live",
    hasUnpublishedChanges: JSON.stringify(draft) !== JSON.stringify(content),
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
    draft,
    content,
    examConfig: readExamConfig(row.exam_config),
  };
}

/* ── Public read ──────────────────────────────────────────────────────────── */

export type PublishedLandingSite = {
  slug: string;
  name: string;
  content: LandingContent;
  examConfig: ExamConfig;
};

/**
 * The live text for a site, or null when the site does not exist or is hidden.
 * The main site always resolves — to its defaults if it has no row yet.
 */
export async function getPublishedLandingSite(slug: string): Promise<PublishedLandingSite | null> {
  const read = unstable_cache(
    async () => {
      const { data, error } = await createSupabaseAdminClient()
        .from(TABLE)
        .select("slug, name, status, content, exam_config")
        .eq("slug", slug)
        .maybeSingle();
      if (error) throw error;
      return data as Pick<
        LandingSiteRow,
        "slug" | "name" | "status" | "content" | "exam_config"
      > | null;
    },
    ["landing-site", slug],
    // The tag is cleared on Publish; the timer only bounds staleness if a
    // publish's revalidation is ever missed.
    { tags: [landingSiteTag(slug)], revalidate: 600 },
  );

  try {
    const row = await read();
    if (row && row.status !== "hidden") {
      return {
        slug: row.slug,
        name: row.name,
        content: sanitizeLandingContent(row.content),
        examConfig: readExamConfig(row.exam_config),
      };
    }
  } catch (error) {
    console.error(`[landing-sites] could not read "${slug}"`, error);
  }

  return slug === MAIN_SITE_SLUG
    ? {
        slug,
        name: "NanoSyllabus",
        content: DEFAULT_LANDING_CONTENT,
        examConfig: readExamConfig(null),
      }
    : null;
}

/* ── Admin ────────────────────────────────────────────────────────────────── */

export class LandingSiteError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** The main site's row, created from the shipped wording the first time it is needed. */
async function ensureMainSite() {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from(TABLE).upsert(
    {
      slug: MAIN_SITE_SLUG,
      name: "NanoSyllabus (main site)",
      status: "live",
      content: DEFAULT_LANDING_CONTENT,
      draft: DEFAULT_LANDING_CONTENT,
      published_at: new Date().toISOString(),
    },
    { onConflict: "slug", ignoreDuplicates: true },
  );
  if (error) throw error;
}

export async function listLandingSites(): Promise<LandingSiteSummary[]> {
  await ensureMainSite();
  const { data, error } = await createSupabaseAdminClient().from(TABLE).select(COLUMNS);
  if (error) throw error;
  return ((data ?? []) as LandingSiteRow[])
    .map(toDetail)
    .map(({ draft: _draft, content: _content, examConfig: _examConfig, ...summary }) => summary)
    .sort((a, b) =>
      a.slug === MAIN_SITE_SLUG ? -1 : b.slug === MAIN_SITE_SLUG ? 1 : a.slug.localeCompare(b.slug),
    );
}

export async function getLandingSite(slug: string): Promise<LandingSiteDetail | null> {
  if (slug === MAIN_SITE_SLUG) await ensureMainSite();
  const { data, error } = await createSupabaseAdminClient()
    .from(TABLE)
    .select(COLUMNS)
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return data ? toDetail(data as LandingSiteRow) : null;
}

export async function createLandingSite(input: {
  slug: string;
  name: string;
  copyFrom?: string;
  userId: string;
}): Promise<LandingSiteDetail> {
  const slug = input.slug.trim().toLowerCase();
  const name = input.name.trim().slice(0, 80);
  if (!isValidSiteSlug(slug)) {
    throw new LandingSiteError(
      "Use 1–40 lowercase letters, numbers or hyphens, starting and ending with a letter or number.",
      400,
    );
  }
  if (RESERVED_SITE_SLUGS.has(slug)) {
    throw new LandingSiteError(`“${slug}” is reserved. Pick another name.`, 400);
  }
  if (!name) throw new LandingSiteError("Give the site a name.", 400);

  // A new site starts as a copy of an existing one's LIVE text (the main site
  // by default), so it is never a blank page.
  const source = await getLandingSite(input.copyFrom || MAIN_SITE_SLUG);
  const content = source?.content ?? DEFAULT_LANDING_CONTENT;

  const { data, error } = await createSupabaseAdminClient()
    .from(TABLE)
    .insert({
      slug,
      name,
      // Hidden until the admin has edited and published it.
      status: "hidden",
      content,
      draft: content,
      updated_by: input.userId,
    })
    .select(COLUMNS)
    .single();
  if (error) {
    if (error.code === "23505") throw new LandingSiteError(`${slug} already exists.`, 409);
    throw error;
  }
  return toDetail(data as LandingSiteRow);
}

export async function updateLandingSite(
  slug: string,
  patch: { draft?: unknown; name?: string; status?: LandingSiteStatus; examConfig?: unknown },
  userId: string,
): Promise<LandingSiteDetail> {
  const update: Record<string, unknown> = {
    updated_by: userId,
    updated_at: new Date().toISOString(),
  };
  if (patch.draft !== undefined) update.draft = sanitizeLandingContent(patch.draft);
  if (patch.name !== undefined) {
    const name = patch.name.trim().slice(0, 80);
    if (!name) throw new LandingSiteError("Give the site a name.", 400);
    update.name = name;
  }
  if (patch.status !== undefined) {
    if (slug === MAIN_SITE_SLUG && patch.status === "hidden") {
      throw new LandingSiteError("The main site can’t be hidden.", 400);
    }
    update.status = patch.status;
  }

  if (patch.examConfig !== undefined) {
    const parsed = examConfigSchema.safeParse(patch.examConfig);
    if (!parsed.success) throw new LandingSiteError(parsed.error.issues[0].message, 400);
    if (parsed.data.planIds.length) {
      const { data: plans, error } = await createSupabaseAdminClient()
        .from("subscription_plans")
        .select("id")
        .in("id", parsed.data.planIds)
        .eq("is_active", true)
        .eq("product_type", "individual")
        .eq("billing_type", "monthly")
        .gt("price", 0);
      if (error) throw error;
      if (plans?.length !== new Set(parsed.data.planIds).size)
        throw new LandingSiteError("Choose active individual payment plans.", 400);
    }
    const { error } = await createSupabaseAdminClient().rpc("configure_landing_exam", {
      target_exam_slug: slug,
      configuration: parsed.data,
    });
    if (error)
      throw new LandingSiteError(
        error.code === "22023"
          ? "Choose active public faculties for this exam."
          : "Could not save exam setup.",
        error.code === "22023" ? 400 : 500,
      );
  }

  const { data, error } = await createSupabaseAdminClient()
    .from(TABLE)
    .update(update)
    .eq("slug", slug)
    .select(COLUMNS)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new LandingSiteError("That site no longer exists.", 404);

  // Status and name show on the live site; the draft does not.
  if (patch.status !== undefined || patch.name !== undefined || patch.examConfig !== undefined) {
    refreshLiveSite(slug);
    revalidatePath(`/prepare/${slug}`);
    revalidatePath(`/payment/${slug}`);
  }
  return toDetail(data as LandingSiteRow);
}

/** Copies the draft over the live text. `draft` (when given) is saved first, in the same write. */
export async function publishLandingSite(slug: string, userId: string, draft?: unknown) {
  const current = await getLandingSite(slug);
  if (!current) throw new LandingSiteError("That site no longer exists.", 404);
  const next = draft === undefined ? current.draft : sanitizeLandingContent(draft);
  const now = new Date().toISOString();

  const { data, error } = await createSupabaseAdminClient()
    .from(TABLE)
    .update({ draft: next, content: next, published_at: now, updated_at: now, updated_by: userId })
    .eq("slug", slug)
    .select(COLUMNS)
    .single();
  if (error) throw error;

  refreshLiveSite(slug);
  return toDetail(data as LandingSiteRow);
}

export async function deleteLandingSite(slug: string) {
  if (slug === MAIN_SITE_SLUG) throw new LandingSiteError("The main site can’t be deleted.", 400);
  const { error } = await createSupabaseAdminClient().from(TABLE).delete().eq("slug", slug);
  if (error) throw error;
  refreshLiveSite(slug);
}

function refreshLiveSite(slug: string) {
  revalidateTag(landingSiteTag(slug));
  revalidatePath(slug === MAIN_SITE_SLUG ? "/" : `/sites/${slug}`);
}

export type CommunityChoice = { id: string; slug: string; name: string; faculty: string | null; visibility?: "public" | "unlisted" | "private" };

/** Active communities a site's main button can lead into, for the editor's picker. */
export async function listCommunityChoices(): Promise<CommunityChoice[]> {
  const { data, error } = await createSupabaseAdminClient()
    .from("communities")
    .select("id, slug, name, faculty")
    .eq("status", "active")
    .eq("visibility", "public")
    .order("name");
  if (error) throw error;
  return (data ?? []) as CommunityChoice[];
}
