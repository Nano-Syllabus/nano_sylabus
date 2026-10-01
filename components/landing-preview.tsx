"use client";

import { useEffect, useRef, useState } from "react";
import { LandingView } from "@/components/landing-view";
import { LANDING_SECTIONS, sanitizeLandingContent, type LandingContent } from "@/lib/landing-content";
import { matchLandingField } from "@/lib/landing-edits";

export type LandingPreviewMessage =
  | { type: "landing-preview:content"; content: LandingContent }
  | { type: "landing-preview:scroll"; section: string }
  | { type: "landing-preview:selected"; section: string | null; path: string | null };

/** What the preview tells the editor. */
export type LandingPreviewEvent =
  | { type: "landing-preview:ready" }
  | { type: "landing-preview:select"; section: string; path: string | null };

type Box = { top: number; left: number; width: number; height: number };

const SECTION_TITLES = new Map(LANDING_SECTIONS.map((section) => [section.key as string, section.title]));

function boxOf(element: Element | null): Box | null {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  if (!rect.width && !rect.height) return null;
  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
}

/** The clicked element's text, then each parent's, up to its section. */
function textsFrom(target: Element, sectionRoot: Element | null) {
  const texts: string[] = [];
  for (let node: Element | null = target; node; node = node.parentElement) {
    const text = (node as HTMLElement).innerText ?? node.textContent ?? "";
    if (text.trim()) texts.push(text);
    if (node === sectionRoot || texts.length > 6) break;
  }
  return texts;
}

/**
 * The landing page inside the editor's iframe. It takes new text from the
 * editor (same origin only) and re-renders. Like a site builder, hovering
 * outlines a section, and clicking one selects it: the editor then opens that
 * section's fields at the text that was clicked. Links are inert so a stray
 * click cannot navigate the preview away.
 */
export function LandingPreview({ initialContent }: { initialContent: LandingContent }) {
  const [content, setContent] = useState(initialContent);
  const contentRef = useRef(content);
  contentRef.current = content;

  const [hover, setHover] = useState<{ section: string; box: Box; field: Box | null } | null>(null);
  const [selected, setSelected] = useState<{ section: string | null; path: string | null }>({ section: null, path: null });
  const [selectedBox, setSelectedBox] = useState<Box | null>(null);
  const hoverTarget = useRef<{ section: Element; field: Element | null } | null>(null);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin || event.source !== window.parent) return;
      const message = event.data as LandingPreviewMessage;
      if (message?.type === "landing-preview:content") {
        setContent(sanitizeLandingContent(message.content));
      } else if (message?.type === "landing-preview:scroll") {
        const target = document.querySelector(`[data-landing-section="${CSS.escape(message.section)}"]`);
        if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
        else if (message.section === "hero" || message.section === "nav" || message.section === "brand") {
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      } else if (message?.type === "landing-preview:selected") {
        setSelected({ section: message.section, path: message.path });
      }
    }

    function sectionOf(target: EventTarget | null) {
      const element = target instanceof Element ? target : null;
      const root = element?.closest("[data-landing-section]") ?? null;
      return { element, root, key: root?.getAttribute("data-landing-section") ?? null };
    }

    function onClick(event: MouseEvent) {
      const { element, root, key } = sectionOf(event.target);
      if (element?.closest("a")) event.preventDefault();
      if (!element || !key) return;
      // The logo sits in the header and footer; it belongs to Brand.
      const path = key === "brand" ? "brand.logoUrl" : matchLandingField(contentRef.current, key, textsFrom(element, root));
      const section = path ? path.split(".")[0] : key;
      setSelected({ section, path });
      window.parent.postMessage({ type: "landing-preview:select", section, path }, window.location.origin);
    }

    function onOver(event: MouseEvent) {
      const { element, root, key } = sectionOf(event.target);
      if (!element || !root || !key) {
        hoverTarget.current = null;
        setHover(null);
        return;
      }
      const path = key === "brand" ? null : matchLandingField(contentRef.current, key, textsFrom(element, root).slice(0, 2));
      const field = path ? element : null;
      hoverTarget.current = { section: root, field };
      const box = boxOf(root);
      setHover(box ? { section: key, box, field: boxOf(field) } : null);
    }

    function onLeave() {
      hoverTarget.current = null;
      setHover(null);
    }

    function onScroll() {
      const target = hoverTarget.current;
      if (!target) return;
      const box = boxOf(target.section);
      setHover((current) => (current && box ? { ...current, box, field: boxOf(target.field) } : current));
    }

    window.addEventListener("message", onMessage);
    document.addEventListener("click", onClick, true);
    document.addEventListener("mouseover", onOver);
    document.documentElement.addEventListener("mouseleave", onLeave);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.parent.postMessage({ type: "landing-preview:ready" }, window.location.origin);
    return () => {
      window.removeEventListener("message", onMessage);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("mouseover", onOver);
      document.documentElement.removeEventListener("mouseleave", onLeave);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  // Keep the selected section's outline glued to it while the page scrolls,
  // animates or re-renders with new text.
  useEffect(() => {
    if (!selected.section) {
      setSelectedBox(null);
      return;
    }
    let frame = 0;
    const key = selected.section === "seo" ? null : selected.section;
    const track = () => {
      const element = key ? document.querySelector(`[data-landing-section="${CSS.escape(key)}"]`) : null;
      const next = boxOf(element);
      setSelectedBox((current) =>
        current && next && current.top === next.top && current.left === next.left && current.width === next.width && current.height === next.height
          ? current
          : next,
      );
      frame = window.requestAnimationFrame(track);
    };
    track();
    return () => window.cancelAnimationFrame(frame);
  }, [selected.section]);

  const showHover = hover && hover.section !== selected.section;

  return (
    <>
      <LandingView content={content} />
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[100]">
        {selectedBox ? (
          <div
            className="absolute rounded-[3px] outline outline-2 outline-[#2563eb]"
            style={{ top: selectedBox.top, left: selectedBox.left, width: selectedBox.width, height: selectedBox.height }}
          >
            <span className="absolute left-0 top-0 -translate-y-full rounded-t-md bg-[#2563eb] px-2 py-0.5 font-sans text-[11px] font-semibold text-white"
              style={selectedBox.top < 22 ? { transform: "none", borderRadius: "0 0 6px 0" } : undefined}>
              {SECTION_TITLES.get(selected.section ?? "") ?? selected.section}
            </span>
          </div>
        ) : null}
        {showHover ? (
          <div
            className="absolute rounded-[3px] outline-dashed outline-1 outline-[#2563eb]/70"
            style={{ top: hover.box.top, left: hover.box.left, width: hover.box.width, height: hover.box.height }}
          >
            <span className="absolute right-0 top-0 rounded-bl-md bg-[#2563eb]/90 px-2 py-0.5 font-sans text-[11px] font-medium text-white">
              {SECTION_TITLES.get(hover.section) ?? hover.section} · click to edit
            </span>
          </div>
        ) : null}
        {hover?.field ? (
          <div
            className="absolute rounded-[3px] bg-[#2563eb]/5 outline outline-1 outline-[#2563eb]"
            style={{ top: hover.field.top - 2, left: hover.field.left - 2, width: hover.field.width + 4, height: hover.field.height + 4 }}
          />
        ) : null}
      </div>
      <style>{`[data-landing-section]{cursor:pointer}`}</style>
    </>
  );
}
