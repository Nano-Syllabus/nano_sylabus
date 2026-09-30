/**
 * Every word on the landing page, as data.
 *
 * The design lives in `components/landing-view.tsx` and never changes per
 * site; each site (nanosyllabus.com, highschool.nanosyllabus.com, …) only
 * swaps this text. `DEFAULT_LANDING_CONTENT` is the wording the page shipped
 * with, and it is also the shape every stored copy is checked against:
 * `sanitizeLandingContent` keeps only keys that exist here, so a stale or
 * hand-edited row can never break the page — missing text falls back to
 * these defaults.
 *
 * Shared by the server (rendering, the admin API) and the admin editor, so it
 * must stay free of server-only imports.
 */

export type LandingContent = {
  /**
   * Not text: the site's look and its one main action. Colours are `#rrggbb`;
   * `communitySlug` sends every main button into that community's join +
   * onboarding flow, and empty keeps the "pick your faculty" browse page.
   */
  brand: { logoUrl: string; primaryColor: string; accentColor: string; communitySlug: string };
  seo: { title: string; description: string };
  nav: { stepsLink: string; peopleLink: string; questionsLink: string };
  hero: {
    titleLead: string;
    titleHighlight: string;
    subtitle: string;
    primaryCta: string;
    secondaryCta: string;
    demoCaption: string;
  };
  features: { hidden: boolean; items: Array<{ title: string }> };
  ribbonOne: { hidden: boolean; items: string[] };
  problems: {
    hidden: boolean;
    headingLine1: string;
    headingLine2: string;
    items: Array<{ quote: string; label: string }>;
  };
  steps: {
    hidden: boolean;
    headingLine1: string;
    headingLine2: string;
    items: Array<{ title: string; detail: string; foot: string }>;
    footnote: string;
    cta: string;
  };
  featured: {
    hidden: boolean;
    badge: string;
    titleHighlight: string;
    titleRest: string;
    body: string;
    author: string;
    readTime: string;
    cta: string;
  };
  ribbonTwo: { hidden: boolean; items: string[] };
  testimonials: {
    hidden: boolean;
    titleLead: string;
    titleHighlight: string;
    subtitle: string;
    items: Array<{ quote: string; name: string; course: string }>;
  };
  community: {
    hidden: boolean;
    headingLine1: string;
    headingLine2: string;
    body: string;
    cta: string;
    liveBadge: string;
    items: Array<{ title: string; detail: string; note: string }>;
  };
  prize: {
    hidden: boolean;
    badge: string;
    headingLine1: string;
    headingLine2: string;
    headingLine3: string;
    body: string;
    howToTitle: string;
    howToSteps: string[];
    primaryCta: string;
    secondaryCta: string;
    boardLabel: string;
    winnersLabel: string;
    firstPrizeLabel: string;
    firstPrizeAmount: string;
    firstPrizeExtra: string;
    secondPrizeLabel: string;
    secondPrize: string;
    thirdPrizeLabel: string;
    thirdPrize: string;
    resultsLabel: string;
    resultsWhere: string;
    footnote: string;
  };
  faq: {
    hidden: boolean;
    headingLine1: string;
    headingLine2: string;
    items: Array<{ question: string; answer: string }>;
  };
  finalCta: { headingLine1: string; headingLine2: string; cta: string };
  footer: { tagline: string; appLink: string };
};

export const DEFAULT_LANDING_CONTENT: LandingContent = {
  brand: { logoUrl: "", primaryColor: "#3049ed", accentColor: "#dcfa72", communitySlug: "" },
  seo: {
    title: "NanoSyllabus — AI Study Companion for Nepal",
    description:
      "Turn your syllabus into focused study challenges. Practice with guided feedback, exam prep, and a supportive community built for Nepal's students.",
  },
  nav: {
    stepsLink: "The little steps",
    peopleLink: "The people",
    questionsLink: "The questions",
  },
  hero: {
    titleLead: "10x your exam",
    titleHighlight: "preparation.",
    subtitle:
      "Everything you need from notes, solved past papers, mock exams, AI tutor to real-time progress tracking - organized into a study routine, one topic at a time.",
    primaryCta: "Find your faculty",
    secondaryCta: "How does it work?",
    demoCaption:
      "NanoSyllabus product tour: communities, micro-topics, the challenge loop, past-question solutions, Roman Nepali, handwritten exams, Library and NanoAI, Revision, and Cash Prize",
  },
  features: {
    hidden: false,
    items: [
      { title: "Complete syllabus divided into micro-topics" },
      { title: "Past questions with worked solutions" },
      { title: "English and Roman Nepali content" },
      { title: "Handwritten exam practice with AI grader" },
    ],
  },
  ribbonOne: {
    hidden: false,
    items: ["Less panic", "More practice", "Your people", "Small wins", "Real learning"],
  },
  problems: {
    hidden: false,
    headingLine1: "More notes aren’t a study plan.",
    headingLine2: "A clear next step is.",
    items: [
      { quote: "“I spent so long learning. I barely had time to practise.”", label: "The practice gap" },
      { quote: "“I really thought I would pass this time.”", label: "The confidence gap" },
      { quote: "“I know the concept. Why am I stuck?”", label: "The understanding gap" },
    ],
  },
  steps: {
    hidden: false,
    headingLine1: "Big syllabus.",
    headingLine2: "Little victories.",
    items: [
      {
        title: "Learn one thing.",
        detail: "Study one focused topic, guided by your official syllabus and question bank.",
        foot: "Less ‘where do I start?’",
      },
      {
        title: "See the working.",
        detail: "Work through a past-question solution. Understand how the answer comes together.",
        foot: "More ‘oh, that’s why.’",
      },
      {
        title: "Make your attempt.",
        detail: "Put pen to paper. Try a question without the solution doing the thinking.",
        foot: "Your brain. Your turn.",
      },
      {
        title: "Find your next step.",
        detail: "Get your handwritten answer checked. Use detailed feedback to see what needs another try.",
        foot: "A small win to build on.",
      },
    ],
    footnote: "A challenge is a learning loop. Not just a quiz.",
    cta: "Find my starting point",
  },
  featured: {
    hidden: false,
    badge: "Featured",
    titleHighlight: "A Smarter Way",
    titleRest: "to Study.",
    body: "A syllabus tells you what to cover. A study routine helps you actually cover it. Learn how focused topics, past questions, and written practice fit together.",
    author: "Nano Syllabus Team",
    readTime: "10 min read",
    cta: "Read Article",
  },
  ribbonTwo: {
    hidden: false,
    items: ["Unlimited tests", "AI feedback", "Chapter-wise practice", "Progress tracking", "Study community"],
  },
  testimonials: {
    hidden: false,
    titleLead: "Loved by learners. Proven",
    titleHighlight: "by results.",
    subtitle: "Join thousands of students who are studying smarter and achieving more with NanoSyllabus.",
    items: [
      {
        quote:
          "NanoSyllabus made my preparation so organized. The mock tests and feedback helped me improve every week.",
        name: "Simrika Duwal",
        course: "CSIT, 3rd Year",
      },
      {
        quote:
          "The chapter-wise practice and instant feedback helped me clear concepts I always found difficult.",
        name: "Rohit Paudel",
        course: "BCT, 4th Year",
      },
      {
        quote:
          "Unlimited mock tests and smart analytics show exactly where I stand. It's like having a personal coach.",
        name: "Suman Giri",
        course: "CSIT, 4rd Year",
      },
    ],
  },
  community: {
    hidden: false,
    headingLine1: "Study alone.",
    headingLine2: "Just not on your own.",
    body: "You don’t always need someone to explain the chapter. Sometimes, you need people who’ll sit down and study alongside you.",
    cta: "Join Discord Community",
    liveBadge: "12 students studying now",
    items: [
      {
        title: "A community around your course.",
        detail:
          "Create or join a space with students studying the same subjects. Keep shared notes, past questions and learning material together.",
        note: "",
      },
      {
        title: "Quiet company. Real studying.",
        detail:
          "Join a silent Discord study session. Open your material and get to work, with others doing the same.",
        note: "Session and camera rules vary by community.",
      },
      {
        title: "Your pace still belongs to you.",
        detail:
          "A shared syllabus doesn’t mean an identical starting point. Work on the topic you need, one challenge at a time.",
        note: "",
      },
    ],
  },
  prize: {
    hidden: false,
    badge: "Tag the study buddy who needs this!",
    headingLine1: "Your exam prep",
    headingLine2: "could pay off,",
    headingLine3: "literally.",
    body: "NanoSyllabus is turning your study streak into a chance to win cash. Join for free, keep learning, and earn extra entries when your friends join.",
    howToTitle: "How to join",
    howToSteps: [
      "Join NanoSyllabus for free.",
      "Maintain a 7+ day streak of daily learning challenge.",
      "Refer friends: every 5 referrals adds 1 extra entry with your name on the wheel.",
    ],
    primaryCta: "Join free & start a challenge",
    secondaryCta: "Join Discord for updates",
    boardLabel: "Weekly Lucky draw",
    winnersLabel: "3 winners",
    firstPrizeLabel: "First prize",
    firstPrizeAmount: "Win Rs. 5,000",
    firstPrizeExtra: "+ 3 months Pro Subscription",
    secondPrizeLabel: "02 / Second prize",
    secondPrize: "3 months Pro Subscription",
    thirdPrizeLabel: "03 / Third prize",
    thirdPrize: "1 month Pro Subscription",
    resultsLabel: "Results announced on",
    resultsWhere: "Discord",
    footnote: "Stay consistent for 7+ days. Every 5 successful referrals gives you one extra name in the draw.",
  },
  faq: {
    hidden: false,
    headingLine1: "Frequently Asked",
    headingLine2: "Questions",
    items: [
      {
        question: "What is NanoSyllabus?",
        answer:
          "NanoSyllabus turns your syllabus into focused learning challenges with practice, feedback, and a clearer next step.",
      },
      {
        question: "Where does the learning content come from?",
        answer:
          "Learning content and past-question solutions are guided by official syllabuses and question banks.",
      },
      {
        question: "What do I actually do on NanoSyllabus?",
        answer:
          "Choose your subjects, learn one topic, work through an example, attempt a question, and use feedback to decide what to practise next.",
      },
      {
        question: "Can I start for free?",
        answer:
          "Yes. You get 3 free learning challenges every day. Start with a topic and build your routine at your own pace.",
      },
      {
        question: "What do I get for Plus Subscription?",
        answer:
          "Paid access gives you unlimited challenges and all semesters, subjects, and study material available on NanoSyllabus including unlimited handwritten exam grading.",
      },
    ],
  },
  finalCta: {
    headingLine1: "One topic today.",
    headingLine2: "A habit for the semester.",
    cta: "Start my first learning challenges",
  },
  footer: {
    tagline: "Small challenges. Shared ambition.",
    appLink: "Go to the app",
  },
};

/* ── The editor's map of the page ─────────────────────────────────────────── */

export type LandingField = {
  key: string;
  label: string;
  /** `long` = a paragraph (textarea); otherwise one line. */
  long?: boolean;
  /** A non-text control; plain text when absent. */
  kind?: "color" | "image" | "community";
  hint?: string;
};

export type LandingList =
  | { key: string; label: string; itemLabel: string; kind: "strings" }
  | { key: string; label: string; itemLabel: string; kind: "items"; fields: LandingField[] };

export type LandingSection = {
  key: keyof LandingContent;
  title: string;
  /** Where it sits on the page, in plain words. */
  where: string;
  hideable: boolean;
  fields: LandingField[];
  lists?: LandingList[];
};

/**
 * Lists whose length the editor may change. Every other list keeps exactly
 * the number of entries the design was drawn for (three cards, four steps…).
 */
export const LANDING_LIST_LIMITS: Record<string, { min: number; max: number }> = {
  "faq.items": { min: 1, max: 12 },
};

export const LANDING_SECTIONS: LandingSection[] = [
  {
    key: "brand",
    title: "Brand & main button",
    where: "Logo, colours, and where every main button leads",
    hideable: false,
    fields: [
      { key: "communitySlug", label: "Main button opens", kind: "community", hint: "Visitors join this community and go straight into onboarding." },
      { key: "logoUrl", label: "Logo", kind: "image", hint: "Replaces the nanosyllabus logo in the header and footer. PNG, SVG or WebP, up to 1 MB." },
      { key: "primaryColor", label: "Primary colour", kind: "color", hint: "Buttons, ribbons and the blue sections. White text sits on it, so keep it dark enough." },
      { key: "accentColor", label: "Accent colour", kind: "color", hint: "Highlights and the closing banner. Dark text sits on it, so keep it light." },
    ],
  },
  {
    key: "seo",
    title: "Search & browser tab",
    where: "Google results and the browser tab — not on the page itself",
    hideable: false,
    fields: [
      { key: "title", label: "Page title" },
      { key: "description", label: "Search description", long: true, hint: "About 150 characters reads best." },
    ],
  },
  {
    key: "nav",
    title: "Top menu",
    where: "The links in the header",
    hideable: false,
    fields: [
      { key: "stepsLink", label: "First link" },
      { key: "peopleLink", label: "Second link" },
      { key: "questionsLink", label: "Third link" },
    ],
  },
  {
    key: "hero",
    title: "Hero",
    where: "The big headline at the top",
    hideable: false,
    fields: [
      { key: "titleLead", label: "Headline" },
      { key: "titleHighlight", label: "Highlighted end of headline", hint: "Shown with the lime marker." },
      { key: "subtitle", label: "Subtitle", long: true },
      { key: "primaryCta", label: "Main button" },
      { key: "secondaryCta", label: "Secondary link" },
      { key: "demoCaption", label: "Product tour description", long: true, hint: "Read by screen readers only." },
    ],
  },
  {
    key: "features",
    title: "Feature cards",
    where: "The four animated cards under the product tour",
    hideable: true,
    fields: [],
    lists: [
      { key: "items", label: "Cards", itemLabel: "Card", kind: "items", fields: [{ key: "title", label: "Title" }] },
    ],
  },
  {
    key: "ribbonOne",
    title: "Blue ribbon (first)",
    where: "The blue strip after the feature cards",
    hideable: true,
    fields: [],
    lists: [{ key: "items", label: "Phrases", itemLabel: "Phrase", kind: "strings" }],
  },
  {
    key: "problems",
    title: "Sound familiar?",
    where: "Three quote cards about why studying is hard",
    hideable: true,
    fields: [
      { key: "headingLine1", label: "Heading, line 1" },
      { key: "headingLine2", label: "Heading, line 2" },
    ],
    lists: [
      {
        key: "items",
        label: "Quote cards",
        itemLabel: "Card",
        kind: "items",
        fields: [
          { key: "quote", label: "Quote", long: true },
          { key: "label", label: "Label" },
        ],
      },
    ],
  },
  {
    key: "steps",
    title: "How it works",
    where: "The four numbered steps",
    hideable: true,
    fields: [
      { key: "headingLine1", label: "Heading, line 1" },
      { key: "headingLine2", label: "Heading, line 2 (italic)" },
      { key: "footnote", label: "Line under the steps" },
      { key: "cta", label: "Button" },
    ],
    lists: [
      {
        key: "items",
        label: "Steps",
        itemLabel: "Step",
        kind: "items",
        fields: [
          { key: "title", label: "Title" },
          { key: "detail", label: "Description", long: true },
          { key: "foot", label: "Small caption" },
        ],
      },
    ],
  },
  {
    key: "featured",
    title: "Featured article",
    where: "The card with the notebook photo",
    hideable: true,
    fields: [
      { key: "badge", label: "Badge" },
      { key: "titleHighlight", label: "Title, highlighted part" },
      { key: "titleRest", label: "Title, rest" },
      { key: "body", label: "Text", long: true },
      { key: "author", label: "Author" },
      { key: "readTime", label: "Reading time" },
      { key: "cta", label: "Button" },
    ],
  },
  {
    key: "ribbonTwo",
    title: "Blue ribbon (second)",
    where: "The blue strip before the testimonials",
    hideable: true,
    fields: [],
    lists: [{ key: "items", label: "Phrases", itemLabel: "Phrase", kind: "strings" }],
  },
  {
    key: "testimonials",
    title: "Testimonials",
    where: "Three student quotes",
    hideable: true,
    fields: [
      { key: "titleLead", label: "Heading" },
      { key: "titleHighlight", label: "Highlighted end of heading" },
      { key: "subtitle", label: "Subtitle", long: true },
    ],
    lists: [
      {
        key: "items",
        label: "Quotes",
        itemLabel: "Student",
        kind: "items",
        fields: [
          { key: "quote", label: "Quote", long: true },
          { key: "name", label: "Name" },
          { key: "course", label: "Course / year" },
        ],
      },
    ],
  },
  {
    key: "community",
    title: "Community",
    where: "The blue Discord section",
    hideable: true,
    fields: [
      { key: "headingLine1", label: "Heading, line 1" },
      { key: "headingLine2", label: "Heading, line 2 (italic)" },
      { key: "body", label: "Text", long: true },
      { key: "cta", label: "Button" },
      { key: "liveBadge", label: "Live badge on the picture" },
    ],
    lists: [
      {
        key: "items",
        label: "Points",
        itemLabel: "Point",
        kind: "items",
        fields: [
          { key: "title", label: "Title" },
          { key: "detail", label: "Description", long: true },
          { key: "note", label: "Small note (optional)" },
        ],
      },
    ],
  },
  {
    key: "prize",
    title: "Cash prize",
    where: "The weekly lucky draw section",
    hideable: true,
    fields: [
      { key: "badge", label: "Badge" },
      { key: "headingLine1", label: "Heading, line 1" },
      { key: "headingLine2", label: "Heading, line 2" },
      { key: "headingLine3", label: "Heading, line 3 (italic)" },
      { key: "body", label: "Text", long: true },
      { key: "howToTitle", label: "Steps title" },
      { key: "primaryCta", label: "Main button" },
      { key: "secondaryCta", label: "Second button" },
      { key: "boardLabel", label: "Prize board label" },
      { key: "winnersLabel", label: "Winners label" },
      { key: "firstPrizeLabel", label: "First prize label" },
      { key: "firstPrizeAmount", label: "First prize" },
      { key: "firstPrizeExtra", label: "First prize extra" },
      { key: "secondPrizeLabel", label: "Second prize label" },
      { key: "secondPrize", label: "Second prize" },
      { key: "thirdPrizeLabel", label: "Third prize label" },
      { key: "thirdPrize", label: "Third prize" },
      { key: "resultsLabel", label: "Results label" },
      { key: "resultsWhere", label: "Results where" },
      { key: "footnote", label: "Note under the board", long: true },
    ],
    lists: [{ key: "howToSteps", label: "How to join", itemLabel: "Step", kind: "strings" }],
  },
  {
    key: "faq",
    title: "FAQ",
    where: "Frequently asked questions",
    hideable: true,
    fields: [
      { key: "headingLine1", label: "Heading, line 1" },
      { key: "headingLine2", label: "Heading, line 2 (italic)" },
    ],
    lists: [
      {
        key: "items",
        label: "Questions",
        itemLabel: "Question",
        kind: "items",
        fields: [
          { key: "question", label: "Question" },
          { key: "answer", label: "Answer", long: true },
        ],
      },
    ],
  },
  {
    key: "finalCta",
    title: "Closing banner",
    where: "The lime banner at the bottom",
    hideable: false,
    fields: [
      { key: "headingLine1", label: "Heading, line 1" },
      { key: "headingLine2", label: "Heading, line 2 (italic)" },
      { key: "cta", label: "Button" },
    ],
  },
  {
    key: "footer",
    title: "Footer",
    where: "The very bottom of the page",
    hideable: false,
    fields: [
      { key: "tagline", label: "Tagline" },
      { key: "appLink", label: "App link" },
    ],
  },
];

/* ── Reading stored copies safely ─────────────────────────────────────────── */

const MAX_TEXT = 2000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanText(value: unknown, fallback: string) {
  return typeof value === "string" ? value.slice(0, MAX_TEXT) : fallback;
}

function sanitizeNode(value: unknown, template: unknown, path: string): unknown {
  if (typeof template === "string") return cleanText(value, template);
  if (typeof template === "boolean") return typeof value === "boolean" ? value : template;

  if (Array.isArray(template)) {
    if (!Array.isArray(value)) return template;
    const limits = LANDING_LIST_LIMITS[path];
    const itemTemplate = template[0];
    if (limits) {
      const kept = value.slice(0, limits.max).map((item) => sanitizeNode(item, itemTemplate, `${path}[]`));
      return kept.length >= limits.min ? kept : template;
    }
    // Fixed-length lists: the design has a slot per entry, so keep exactly
    // that many and fill any gap from the default at the same position.
    return template.map((fallback, index) => sanitizeNode(value[index], fallback, `${path}[]`));
  }

  if (isRecord(template)) {
    const source = isRecord(value) ? value : {};
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(template)) {
      out[key] = sanitizeNode(source[key], template[key], path ? `${path}.${key}` : key);
    }
    return out;
  }

  return template;
}

/**
 * Any stored value → a complete, well-formed `LandingContent`. Unknown keys
 * are dropped, missing text falls back to the default wording, and list
 * lengths are held to what the design allows.
 */
export function sanitizeLandingContent(value: unknown): LandingContent {
  const content = sanitizeNode(value, DEFAULT_LANDING_CONTENT, "") as LandingContent;
  const fallback = DEFAULT_LANDING_CONTENT.brand;
  const { logoUrl, primaryColor, accentColor, communitySlug } = content.brand;
  content.brand = {
    // Only our own paths or https images: this value lands in an <img src>.
    logoUrl: /^(https:\/\/|\/(?!\/))\S+$/.test(logoUrl.trim()) ? logoUrl.trim() : "",
    primaryColor: HEX_COLOR.test(primaryColor) ? primaryColor.toLowerCase() : fallback.primaryColor,
    accentColor: HEX_COLOR.test(accentColor) ? accentColor.toLowerCase() : fallback.accentColor,
    communitySlug: /^[a-z0-9][a-z0-9-]{0,80}$/.test(communitySlug) ? communitySlug : "",
  };
  return content;
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/* ── Colours ──────────────────────────────────────────────────────────────── */

function mix(hex: string, toward: "#000000" | "#ffffff", amount: number) {
  const channel = (value: string, index: number) => parseInt(value.slice(1 + index * 2, 3 + index * 2), 16);
  return `#${[0, 1, 2]
    .map((index) => {
      const from = channel(hex, index);
      const to = channel(toward, index);
      return Math.round(from + (to - from) * amount)
        .toString(16)
        .padStart(2, "0");
    })
    .join("")}`;
}

/**
 * The landing page's colour variables, derived from the two brand colours.
 * The design was drawn in one blue and one lime; every tint and shade it used
 * is expressed here as a mix of those, so a new pair recolours the whole page
 * consistently. With the default colours these reproduce the original hexes
 * closely.
 */
export function landingColorVars(brand: LandingContent["brand"]): Record<string, string> {
  const primary = HEX_COLOR.test(brand.primaryColor) ? brand.primaryColor : DEFAULT_LANDING_CONTENT.brand.primaryColor;
  const accent = HEX_COLOR.test(brand.accentColor) ? brand.accentColor : DEFAULT_LANDING_CONTENT.brand.accentColor;
  return {
    "--lp-primary": primary,
    "--lp-primary-hover": mix(primary, "#000000", 0.12),
    "--lp-primary-dark": mix(primary, "#000000", 0.2),
    "--lp-primary-deeper": mix(primary, "#000000", 0.35),
    "--lp-primary-deepest": mix(primary, "#000000", 0.55),
    "--lp-primary-soft": mix(primary, "#ffffff", 0.9),
    "--lp-primary-line": mix(primary, "#ffffff", 0.75),
    "--lp-accent": accent,
    "--lp-accent-hover": mix(accent, "#ffffff", 0.3),
    "--lp-accent-strong": mix(accent, "#000000", 0.14),
  };
}
