import {
  DEFAULT_LANDING_CONTENT,
  sanitizeLandingContent,
  type LandingContent,
  type LandingTemplateId,
} from "@/lib/landing-content";

export const LANDING_TEMPLATES: Array<{
  id: LandingTemplateId;
  name: string;
  description: string;
  primary: string;
  accent: string;
  background: string;
}> = [
  {
    id: "original",
    name: "Original",
    description: "The complete product story, animated tour, and bold highlights.",
    primary: "#3049ed",
    accent: "#dcfa72",
    background: "#fafbf7",
  },
  {
    id: "editorial",
    name: "Editorial",
    description: "A warm, magazine-inspired page with a split hero and serif type.",
    primary: "#72452e",
    accent: "#f0d6ab",
    background: "#fbf5eb",
  },
  {
    id: "academy",
    name: "Academy",
    description: "A structured course or exam page with a framed hero and clear steps.",
    primary: "#163b65",
    accent: "#f4cc65",
    background: "#f2f6fa",
  },
  {
    id: "studio",
    name: "Studio",
    description: "A bold, centered launch page with a product showcase and crisp cards.",
    primary: "#663ce5",
    accent: "#d9caff",
    background: "#f7f5ff",
  },
  {
    id: "community",
    name: "Community",
    description: "A friendly, playful page that puts shared learning first.",
    primary: "#9b381d",
    accent: "#d7ef99",
    background: "#fff8ef",
  },
];

/** A fresh copy, so editing one site cannot change another site or a sample. */
export function createLandingTemplate(id: LandingTemplateId): LandingContent {
  const content = structuredClone(DEFAULT_LANDING_CONTENT);
  const sample = LANDING_TEMPLATES.find((template) => template.id === id)!;
  content.design.template = id;
  content.design.backgroundColor = sample.background;
  content.brand.primaryColor = sample.primary;
  content.brand.accentColor = sample.accent;
  if (id === "original") return content;

  // Samples start with the essentials. Every section remains available in the editor.
  content.prize.hidden = true;
  content.ribbonTwo.hidden = true;
  content.testimonials.hidden = true;
  content.problems.hidden = true;
  content.design.showDemo = false;
  content.community.liveBadge = "Your course. Your people.";
  if (id === "editorial") {
    content.design.font = "serif";
    content.design.corners = "square";
    content.design.spacing = "airy";
    content.hero.titleLead = "A little learning.";
    content.hero.titleHighlight = "A lasting habit.";
    content.hero.subtitle =
      "Make room for the ideas that matter. Explore your syllabus, practise with purpose, and find a rhythm that works for you.";
    content.hero.primaryCta = "Explore your course";
    content.ribbonOne.hidden = true;
    content.steps.headingLine1 = "Your syllabus, thoughtfully";
    content.steps.headingLine2 = "broken down.";
  } else if (id === "academy") {
    content.hero.titleLead = "Your next exam.";
    content.hero.titleHighlight = "Your clear plan.";
    content.hero.subtitle =
      "Bring your syllabus, past questions, and written practice together. Know what to study next and build confidence one topic at a time.";
    content.hero.primaryCta = "Find your program";
    content.featured.hidden = true;
    content.community.hidden = true;
    content.ribbonOne.hidden = true;
    content.steps.headingLine1 = "A practical path";
    content.steps.headingLine2 = "to preparation.";
  } else if (id === "studio") {
    content.hero.titleLead = "Big ambitions.";
    content.hero.titleHighlight = "Small steps.";
    content.hero.subtitle =
      "Meet your new study space. Focused topics, worked examples, and feedback that helps you keep moving.";
    content.hero.primaryCta = "Find your starting point";
    content.design.corners = "pill";
    content.design.showDemo = true;
    content.featured.hidden = true;
    content.community.hidden = true;
  } else {
    content.hero.titleLead = "Find your people.";
    content.hero.titleHighlight = "Build your momentum.";
    content.hero.subtitle =
      "A place for your course, your questions, and your next small win. Learn at your own pace with a community alongside you.";
    content.hero.primaryCta = "Find your community";
    content.design.corners = "pill";
    content.featured.hidden = true;
    content.community.headingLine1 = "Different starting points.";
    content.community.headingLine2 = "Shared ambition.";
    content.nav.peopleLink = "Your community";
  }
  return sanitizeLandingContent(content);
}

/** Switching layout is safe for an existing draft; loading sample copy is explicit. */
export function applyLandingTemplate(
  current: LandingContent,
  id: LandingTemplateId,
  keepContent = true,
): LandingContent {
  const sample = createLandingTemplate(id);
  if (keepContent)
    return sanitizeLandingContent({
      ...current,
      design: {
        ...sample.design,
        heroImageUrl: current.design.heroImageUrl,
        showDemo: current.design.showDemo,
      },
    });
  return sanitizeLandingContent({
    ...sample,
    brand: {
      ...sample.brand,
      logoUrl: current.brand.logoUrl,
      iconUrl: current.brand.iconUrl,
      communitySlug: current.brand.communitySlug,
    },
  });
}

export function landingDesignVars(design: LandingContent["design"]): Record<string, string> {
  return {
    "--lp-background": design.backgroundColor,
    "--lp-ink": design.textColor,
    "--lp-font":
      design.font === "serif"
        ? 'Georgia, "Times New Roman", serif'
        : design.font === "mono"
          ? '"Courier New", monospace'
          : "var(--font-inter), Arial, sans-serif",
    "--lp-radius":
      design.corners === "square" ? "0px" : design.corners === "pill" ? "32px" : "18px",
    "--lp-button-radius":
      design.corners === "square" ? "0px" : design.corners === "pill" ? "999px" : "8px",
    "--lp-section-space":
      design.spacing === "compact" ? "48px" : design.spacing === "airy" ? "112px" : "80px",
  };
}
