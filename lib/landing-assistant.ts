import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import type { CommunityChoice } from "@/lib/data/landing-sites";
import { LANDING_LIST_LIMITS, LANDING_SECTIONS, type LandingContent } from "@/lib/landing-content";
import { applyLandingChanges, diffLanding, type LandingChangeRequest } from "@/lib/landing-edits";

/**
 * The website editor's AI assistant: Claude reads the site's current text and
 * the admin's request, and answers with a short reply plus field-level
 * changes. The changes are applied here (never trusted as a whole document),
 * so the page's shape, list lengths and colours stay valid.
 */

export type AssistantTurn = { role: "user" | "assistant"; text: string };

export type AssistantResult = {
  reply: string;
  draft: LandingContent;
  changes: ReturnType<typeof diffLanding>;
};

export class AssistantUnavailableError extends Error {}

const MODEL = process.env.LANDING_ASSISTANT_MODEL?.trim() || process.env.CLAUDE_MODEL?.trim() || "claude-haiku-5-5";

/** The page's editable map in plain words, so the model knows what each path is. */
function pageMap() {
  return LANDING_SECTIONS.map((section) => {
    const lines = [`## ${section.key} — ${section.title}: ${section.where}${section.hideable ? " (can be hidden: path " + section.key + ".hidden)" : ""}`];
    for (const field of section.fields) {
      lines.push(`- ${section.key}.${field.key}: ${field.label}${field.hint ? ` (${field.hint})` : ""}`);
    }
    for (const list of section.lists ?? []) {
      const limits = LANDING_LIST_LIMITS[`${section.key}.${list.key}`];
      const size = limits ? `${limits.min}–${limits.max} entries` : "fixed number of entries";
      const shape = list.kind === "strings" ? "strings" : `objects {${list.fields.map((field) => field.key).join(", ")}}`;
      lines.push(`- ${section.key}.${list.key}: ${list.label}, a list of ${shape}, ${size}. Edit one entry as ${section.key}.${list.key}.<index>${list.kind === "items" ? ".<field>" : ""}.`);
    }
    return lines.join("\n");
  }).join("\n\n");
}

function systemPrompt(communities: CommunityChoice[]) {
  return `You are the website assistant inside NanoSyllabus's admin website editor. NanoSyllabus is an AI study companion for students in Nepal (+2, Bachelor's, entrance and licence exam preparation). Admins use you to customise one landing site.

The page has five layouts: design.template is one of original, editorial, academy, studio, community. You can change every piece of text, brand colours, section visibility, the main button's community, FAQ entries, and design settings. design.font is sans, serif, or mono; design.corners is rounded, square, or pill; design.spacing is comfortable, compact, or airy. design.backgroundColor and design.textColor are #rrggbb colours. design.showDemo is true or false. Changing design.template keeps the current copy and colours. You cannot invent new layouts or sections or change animations.

Answer as JSON: {"reply": string, "changes": [{"path": string, "value": string}]}.
- "reply": one to three short sentences in plain words saying what you changed (or answering the question). No markdown headings.
- "changes": only the fields you are changing. Empty when the admin only asked a question.
- path is dotted, e.g. "hero.titleLead", "faq.items.2.answer", "ribbonOne.items.0", "prize.hidden".
- value is the new text. For a ".hidden" path use "true" or "false". To replace a whole list at once (only the FAQ may change length), use the list path and a JSON array as the value.
- Colours are "#rrggbb". brand.primaryColor carries white text, so keep it dark enough; brand.accentColor carries dark text, so keep it light.
- brand.communitySlug must be "" or one of: ${communities.length ? communities.map((community) => `${community.slug} (${community.name}${community.faculty ? `, ${community.faculty}` : ""})`).join("; ") : "(none available)"}.
- Leave brand.logoUrl, brand.iconUrl, design.heroImageUrl and every testimonials photoUrl alone; images are uploaded or linked by hand.
- Keep each text about as long as the one it replaces unless asked otherwise — the design was drawn for that length. Headlines stay short.
- Write for Nepali students: warm, concrete, confident, no hype. Never use the words "master" or "mastery" (say "learn", "get ready", "pass" instead). Never invent prices, prize amounts, statistics or testimonials from real named people unless the admin gives them.
- When the admin says "this", "here" or similar, they mean the FOCUS given with their message.
- For a request like "make the whole site about X", rewrite every relevant section consistently.

The editable fields:

${pageMap()}`;
}

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    reply: { type: "string" },
    changes: {
      type: "array",
      items: {
        type: "object",
        properties: { path: { type: "string" }, value: { type: "string" } },
        required: ["path", "value"],
        additionalProperties: false,
      },
    },
  },
  required: ["reply", "changes"],
  additionalProperties: false,
};

/** Claude wants turns that alternate and open with the user; the editor's
 *  history can open with the assistant's greeting or repeat a role. */
function alternatingTurns(turns: AssistantTurn[]): Anthropic.MessageParam[] {
  const messages: Anthropic.MessageParam[] = [];
  for (const turn of turns) {
    const role = turn.role === "assistant" ? "assistant" : "user";
    const text = turn.text.slice(0, 4000);
    if (!text.trim() || (!messages.length && role === "assistant")) continue;
    const previous = messages[messages.length - 1];
    if (previous?.role === role) previous.content = `${previous.content as string}\n\n${text}`;
    else messages.push({ role, content: text });
  }
  return messages;
}

export async function runLandingAssistant({
  draft,
  turns,
  focus,
  communities,
}: {
  draft: LandingContent;
  turns: AssistantTurn[];
  focus: { section?: string; path?: string } | null;
  communities: CommunityChoice[];
}): Promise<AssistantResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) throw new AssistantUnavailableError("The AI assistant isn’t set up: ANTHROPIC_API_KEY is missing on the server.");

  const history = turns.slice(-12);
  const last = history.pop();
  if (!last || last.role !== "user" || !last.text.trim()) throw new Error("Type what you’d like to change.");

  const focusLine = focus?.path
    ? `FOCUS: the field ${focus.path}${focus.section ? ` in section ${focus.section}` : ""}.`
    : focus?.section
      ? `FOCUS: the section ${focus.section}.`
      : "FOCUS: none (the whole page).";

  // The site JSON goes on the last turn whole; history turns are capped at 4,000 characters.
  const request = `CURRENT SITE TEXT (JSON):\n${JSON.stringify(draft)}\n\n${focusLine}\n\nREQUEST: ${last.text.slice(0, 4000)}`;
  const messages = alternatingTurns(history);
  const previous = messages[messages.length - 1];
  if (previous?.role === "user") previous.content = `${previous.content as string}\n\n${request}`;
  else messages.push({ role: "user", content: request });

  const client = new Anthropic({ apiKey, timeout: 90_000, maxRetries: 1 });
  let message: Anthropic.Message;
  try {
    message = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: systemPrompt(communities),
      messages,
      thinking: { type: "disabled" },
      output_config: { format: { type: "json_schema", schema: RESPONSE_SCHEMA } },
    });
  } catch (error) {
    console.error(
      "[landing-assistant] Claude error",
      error instanceof Anthropic.APIError ? `${error.status} ${error.message}` : error,
    );
    throw new Error("The AI assistant couldn’t answer just now. Try again.");
  }

  const text = message.content.map((block) => (block.type === "text" ? block.text : "")).join("");
  let parsed: { reply?: unknown; changes?: unknown };
  try {
    parsed = JSON.parse(text);
  } catch {
    console.error("[landing-assistant] unparseable reply", message.stop_reason, text.slice(0, 300));
    throw new Error("The AI assistant’s answer was cut off. Try a smaller request.");
  }

  const requested = Array.isArray(parsed.changes)
    ? (parsed.changes as LandingChangeRequest[]).filter(
        (change) => change && typeof change.path === "string" && !/^(?:brand\.(?:logoUrl|iconUrl)|design\.heroImageUrl)$|\.photoUrl$/.test(change.path),
      )
    : [];
  const next = applyLandingChanges(draft, requested);
  return {
    reply: typeof parsed.reply === "string" && parsed.reply.trim() ? parsed.reply.trim() : "Done.",
    draft: next,
    changes: diffLanding(draft, next),
  };
}
