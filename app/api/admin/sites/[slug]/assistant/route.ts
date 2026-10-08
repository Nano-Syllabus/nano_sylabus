import { NextResponse } from "next/server";
import { assertScopedAdmin, outOfScope, scopeAllowsSite } from "@/lib/admin-scope";
import { getLandingSite, listCommunityChoices } from "@/lib/data/landing-sites";
import {
  AssistantUnavailableError,
  runLandingAssistant,
  type AssistantTurn,
} from "@/lib/landing-assistant";
import { sanitizeLandingContent } from "@/lib/landing-content";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Context = { params: Promise<{ slug: string }> };

/**
 * One turn of the website editor's AI chat. Takes the editor's current draft
 * (it may be ahead of the saved one) and returns the edited draft; the editor
 * applies it and its autosave stores it, exactly like typed edits.
 */
export async function POST(request: Request, { params }: Context) {
  const access = await assertScopedAdmin();
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
  if (!scopeAllowsSite(access.scope, (await params).slug)) return outOfScope("that subdomain");

  const body = (await request.json().catch(() => null)) as {
    draft?: unknown;
    messages?: unknown;
    focus?: { section?: unknown; path?: unknown } | null;
  } | null;
  if (!body) return NextResponse.json({ error: "Type what you’d like to change." }, { status: 400 });

  const turns: AssistantTurn[] = Array.isArray(body.messages)
    ? body.messages
        .filter(
          (message): message is AssistantTurn =>
            !!message &&
            (message.role === "user" || message.role === "assistant") &&
            typeof message.text === "string",
        )
        .map((message) => ({ role: message.role, text: message.text }))
    : [];
  const focus = body.focus
    ? {
        section: typeof body.focus.section === "string" ? body.focus.section.slice(0, 40) : undefined,
        path: typeof body.focus.path === "string" ? body.focus.path.slice(0, 120) : undefined,
      }
    : null;

  try {
    const { slug } = await params;
    const site = await getLandingSite(slug);
    if (!site) return NextResponse.json({ error: "That site doesn’t exist." }, { status: 404 });
    const draft = sanitizeLandingContent(body.draft ?? site.draft);
    const communities = await listCommunityChoices().catch(() => []);
    const result = await runLandingAssistant({ draft, turns, focus, communities });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AssistantUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "The AI assistant couldn’t answer just now." },
      { status: 502 },
    );
  }
}
