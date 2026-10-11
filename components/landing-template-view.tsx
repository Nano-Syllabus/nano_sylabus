import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { LandingPrimaryCta, LandingSiteActions } from "@/components/landing-primary-cta";
import { DISCORD_STUDY_ROOM_URL } from "@/lib/product-links";
import { landingColorVars, type LandingContent } from "@/lib/landing-content";
import { landingDesignVars } from "@/lib/landing-templates";
import styles from "@/components/landing-template-view.module.css";

function Heading({ first, second }: { first: string; second: string }) {
  return (
    <h2>
      {first} <em>{second}</em>
    </h2>
  );
}

/** All four alternate layouts use the same editable fields and site entry flow. */
export function LandingTemplateView({
  content: c,
  joinHref,
  appOrigin,
}: {
  content: LandingContent;
  joinHref?: string;
  appOrigin: string;
}) {
  const ctaProps = { joinHref, appOrigin };
  const template = c.design.template;
  const navLinks = [
    { shown: !c.steps.hidden, href: "#steps", text: c.nav.stepsLink },
    { shown: !c.community.hidden, href: "#discord-community", text: c.nav.peopleLink },
    { shown: !c.faq.hidden, href: "#questions", text: c.nav.questionsLink },
  ].filter((link) => link.shown);
  const brand = (
    <Link href="/" className={styles.brand} data-landing-section="brand" aria-label="Home">
      {c.brand.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={c.brand.logoUrl} alt="" />
      ) : (
        <>
          <span className={styles.brandMark}>n.</span>
          <span>
            nano<span className={styles.brandLight}>syllabus</span>
          </span>
        </>
      )}
    </Link>
  );
  const action = (text: string, hero = false) => (
    <LandingPrimaryCta
      {...ctaProps}
      blue
      communityOnly
      size={hero ? "hero" : "default"}
      className={styles.action}
    >
      {text}
    </LandingPrimaryCta>
  );
  const visual = c.design.heroImageUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={styles.heroImage}
      src={c.design.heroImageUrl}
      alt={`${c.hero.titleLead} ${c.hero.titleHighlight}`}
    />
  ) : (
    <div className={styles.studyBoard} aria-hidden="true">
      <div className={styles.boardHeader}>
        <span>n.</span>
        <span>{c.steps.headingLine1}</span>
        <span>↗</span>
      </div>
      <div className={styles.boardTitle}>{c.steps.headingLine2}</div>
      {c.steps.items.slice(0, 3).map((step, i) => (
        <div className={styles.boardRow} key={i}>
          <span>{String(i + 1).padStart(2, "0")}</span>
          <div>
            <strong>{step.title}</strong>
            <p>{step.foot}</p>
          </div>
          <span>↗</span>
        </div>
      ))}
      <div className={styles.boardNote}>{c.steps.footnote}</div>
    </div>
  );
  const communitySection = c.community.hidden ? null : (
    <section
      key="community"
      data-landing-section="community"
      id="discord-community"
      className={`${styles.section} ${styles.community}`}
    >
      <div>
        {c.community.liveBadge ? (
          <span className={styles.eyebrow}>{c.community.liveBadge}</span>
        ) : null}
        <Heading first={c.community.headingLine1} second={c.community.headingLine2} />
        <p>{c.community.body}</p>
        <a
          className={styles.textLink}
          href={DISCORD_STUDY_ROOM_URL}
          target="_blank"
          rel="noreferrer"
        >
          {c.community.cta} ↗
        </a>
      </div>
      <div className={styles.communityList}>
        {c.community.items.map((item, i) => (
          <article className={styles.card} key={i}>
            <span className={styles.number}>{String(i + 1).padStart(2, "0")}</span>
            <h3>{item.title}</h3>
            <p>{item.detail}</p>
            {item.note && <small>{item.note}</small>}
          </article>
        ))}
      </div>
    </section>
  );
  const sections: Record<string, ReactNode> = {
    ribbonOne: c.ribbonOne.hidden ? null : (
      <div key="ribbonOne" data-landing-section="ribbonOne" className={styles.ribbon}>
        {c.ribbonOne.items.map((text, i) => (
          <span key={i}>
            {text}
            <span aria-hidden="true"> ✦</span>
          </span>
        ))}
      </div>
    ),
    features: c.features.hidden ? null : (
      <section
        key="features"
        data-landing-section="features"
        className={`${styles.section} ${styles.features}`}
      >
        {c.features.items.map((item, i) => (
          <article key={i} className={styles.card}>
            <span className={styles.featureIcon} aria-hidden="true">
              {["↗", "≋", "Aa", "✓"][i]}
            </span>
            <h3>{item.title}</h3>
          </article>
        ))}
      </section>
    ),
    problems: c.problems.hidden ? null : (
      <section key="problems" data-landing-section="problems" className={styles.section}>
        <Heading first={c.problems.headingLine1} second={c.problems.headingLine2} />
        <div className={styles.threeColumns}>
          {c.problems.items.map((item, i) => (
            <blockquote key={i} className={styles.card}>
              <p>{item.quote}</p>
              <footer>{item.label}</footer>
            </blockquote>
          ))}
        </div>
      </section>
    ),
    steps: c.steps.hidden ? null : (
      <section
        key="steps"
        data-landing-section="steps"
        id="steps"
        className={`${styles.section} ${styles.steps}`}
      >
        <div className={styles.sectionHeading}>
          <Heading first={c.steps.headingLine1} second={c.steps.headingLine2} />
          {action(c.steps.cta)}
        </div>
        <div className={styles.stepGrid}>
          {c.steps.items.map((item, i) => (
            <article key={i} className={styles.card}>
              <span className={styles.number}>{String(i + 1).padStart(2, "0")}</span>
              <h3>{item.title}</h3>
              <p>{item.detail}</p>
              <small>{item.foot}</small>
            </article>
          ))}
        </div>
        <p className={styles.footnote}>{c.steps.footnote}</p>
      </section>
    ),
    featured: c.featured.hidden ? null : (
      <section
        key="featured"
        data-landing-section="featured"
        className={`${styles.section} ${styles.featured}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/landing-new/notebook.png" alt="" loading="lazy" />
        <div>
          <span className={styles.eyebrow}>{c.featured.badge}</span>
          <Heading first={c.featured.titleHighlight} second={c.featured.titleRest} />
          <p>{c.featured.body}</p>
          <small>
            {c.featured.author} · {c.featured.readTime}
          </small>
          {!c.steps.hidden && (
            <a className={styles.textLink} href="#steps">
              {c.featured.cta} ↗
            </a>
          )}
        </div>
      </section>
    ),
    ribbonTwo: c.ribbonTwo.hidden ? null : (
      <div key="ribbonTwo" data-landing-section="ribbonTwo" className={styles.ribbon}>
        {c.ribbonTwo.items.map((text, i) => (
          <span key={i}>
            {text}
            <span aria-hidden="true"> ✦</span>
          </span>
        ))}
      </div>
    ),
    testimonials: c.testimonials.hidden ? null : (
      <section
        key="testimonials"
        data-landing-section="testimonials"
        id="people"
        className={styles.section}
      >
        <Heading first={c.testimonials.titleLead} second={c.testimonials.titleHighlight} />
        <p>{c.testimonials.subtitle}</p>
        <div className={styles.threeColumns}>
          {c.testimonials.items.map((item, i) => (
            <figure key={i} className={styles.card}>
              <blockquote>{item.quote}</blockquote>
              <figcaption>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.photoUrl || `/landing-new/avatar-${i + 1}.png`}
                  alt=""
                  loading="lazy"
                />
                <div>
                  <strong>{item.name}</strong>
                  <small>{item.course}</small>
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>
    ),
    community: communitySection,
    prize: c.prize.hidden ? null : (
      <section
        key="prize"
        data-landing-section="prize"
        className={`${styles.section} ${styles.prize}`}
      >
        <div>
          <span className={styles.eyebrow}>{c.prize.badge}</span>
          <Heading
            first={c.prize.headingLine1}
            second={`${c.prize.headingLine2} ${c.prize.headingLine3}`}
          />
          <p>{c.prize.body}</p>
          <h3>{c.prize.howToTitle}</h3>
          <ol>
            {c.prize.howToSteps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
          {action(c.prize.primaryCta)}
          <a
            className={styles.textLink}
            href={DISCORD_STUDY_ROOM_URL}
            target="_blank"
            rel="noreferrer"
          >
            {c.prize.secondaryCta} ↗
          </a>
        </div>
        <div className={styles.card}>
          <span className={styles.eyebrow}>
            {c.prize.boardLabel} · {c.prize.winnersLabel}
          </span>
          <h3>{c.prize.firstPrizeLabel}</h3>
          <h2>{c.prize.firstPrizeAmount}</h2>
          <p>{c.prize.firstPrizeExtra}</p>
          <hr />
          <h3>{c.prize.secondPrizeLabel}</h3>
          <p>{c.prize.secondPrize}</p>
          <h3>{c.prize.thirdPrizeLabel}</h3>
          <p>{c.prize.thirdPrize}</p>
          <small>
            {c.prize.resultsLabel} {c.prize.resultsWhere}
          </small>
          <p>{c.prize.footnote}</p>
        </div>
      </section>
    ),
  };
  const order =
    template === "community"
      ? [
          "ribbonOne",
          "community",
          "features",
          "problems",
          "steps",
          "featured",
          "ribbonTwo",
          "testimonials",
          "prize",
        ]
      : template === "editorial"
        ? [
            "features",
            "featured",
            "ribbonOne",
            "problems",
            "steps",
            "testimonials",
            "ribbonTwo",
            "community",
            "prize",
          ]
        : [
            "ribbonOne",
            "features",
            "problems",
            "steps",
            "featured",
            "ribbonTwo",
            "testimonials",
            "community",
            "prize",
          ];

  return (
    <div
      className={styles.page}
      data-landing-template={template}
      style={{ ...landingColorVars(c.brand), ...landingDesignVars(c.design) } as CSSProperties}
    >
      <a href="#main-content" className={styles.skip}>
        Skip to content
      </a>
      <header data-landing-section="nav" className={styles.header}>
        {brand}
        <nav aria-label="Main navigation">
          {navLinks.map((link) => (
            <a key={link.href} href={link.href}>
              {link.text}
            </a>
          ))}
        </nav>
        {joinHref ? (
          <LandingSiteActions joinHref={joinHref}>{c.hero.primaryCta}</LandingSiteActions>
        ) : (
          <LandingPrimaryCta {...ctaProps}>{c.hero.primaryCta}</LandingPrimaryCta>
        )}
      </header>
      <main id="main-content">
        <section data-landing-section="hero" className={styles.hero}>
          <div className={styles.heroCopy}>
            <h1>
              {c.hero.titleLead} <span>{c.hero.titleHighlight}</span>
            </h1>
            <p>{c.hero.subtitle}</p>
            <div className={styles.heroActions}>
              {action(c.hero.primaryCta, true)}
              {!c.steps.hidden && (
                <a className={styles.textLink} href="#steps">
                  {c.hero.secondaryCta} ↗
                </a>
              )}
            </div>
          </div>
          <div className={styles.heroVisual}>{visual}</div>
        </section>
        {c.design.showDemo && (
          <div data-landing-section="hero" className={styles.demo}>
            <iframe
              src="/nanosyllabus-features-minimal-animation.html?capture"
              title={c.hero.demoCaption}
              loading="lazy"
            />
          </div>
        )}
        {order.map((key) => sections[key])}
        {!c.faq.hidden && (
          <section
            data-landing-section="faq"
            id="questions"
            className={`${styles.section} ${styles.faq}`}
          >
            <Heading first={c.faq.headingLine1} second={c.faq.headingLine2} />
            <div>
              {c.faq.items.map((item, i) => (
                <details key={i}>
                  <summary>
                    {item.question}
                    <span aria-hidden="true">+</span>
                  </summary>
                  <p>{item.answer}</p>
                </details>
              ))}
            </div>
          </section>
        )}
        <section data-landing-section="finalCta" className={`${styles.section} ${styles.finalCta}`}>
          <Heading first={c.finalCta.headingLine1} second={c.finalCta.headingLine2} />
          {action(c.finalCta.cta)}
        </section>
      </main>
      <footer data-landing-section="footer" className={styles.footer}>
        {brand}
        <p>{c.footer.tagline}</p>
        <Link href={joinHref ?? `${appOrigin}/app/community`}>{c.footer.appLink} ↗</Link>
      </footer>
    </div>
  );
}
