"use client";

import { renderMarkdown } from "@/lib/markdown";
import React, { useMemo, useRef } from "react";

const MARKDOWN_CLASS =
  "max-w-full overflow-hidden break-words text-sm leading-relaxed text-text-primary [&_h1]:mt-6 [&_h1]:mb-3 [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:mt-5 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-bold [&_h3]:mt-4 [&_h3]:mb-2 [&_h3]:text-lg [&_h3]:font-semibold [&_h4]:mt-3 [&_h4]:mb-2 [&_h4]:text-base [&_h4]:font-semibold [&_strong]:font-semibold [&_em]:italic [&_code]:font-mono-ui [&_code]:rounded [&_code]:bg-bg-tertiary [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[12px] [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-border [&_pre]:bg-bg-tertiary [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_table]:my-4 [&_table]:block [&_table]:w-fit [&_table]:max-w-full [&_table]:overflow-x-auto [&_table]:border-collapse [&_table]:text-left [&_thead]:bg-bg-tertiary [&_th]:min-w-20 [&_th]:border [&_th]:border-border [&_th]:px-5 [&_th]:py-3 [&_th]:text-[15px] [&_th]:font-semibold [&_td]:min-w-20 [&_td]:border [&_td]:border-border [&_td]:px-5 [&_td]:py-3.5 [&_td]:text-[15px] [&_td]:font-medium [&_tbody_tr:nth-child(even)]:bg-bg-tertiary/40 [&_.math-inline]:align-baseline [&_.math-inline]:break-normal [&_.math-block]:my-3 [&_.math-block]:max-w-full [&_.math-block]:overflow-x-auto [&_.math-block]:rounded-lg [&_.math-block]:border [&_.math-block]:border-border [&_.math-block]:bg-bg-tertiary [&_.math-block]:p-3 [&_.math-block]:text-center [&_.math-block_.katex-display]:my-0 [&_ol]:ml-5 [&_ol]:list-decimal [&_ul]:ml-5 [&_ul]:list-disc [&_li]:mt-1 [&_p]:mt-2 first:[&_p]:mt-0 [&_.tikz-diagram]:my-4 [&_.tikz-diagram]:overflow-x-auto [&_.tikz-diagram]:rounded-lg [&_.tikz-diagram]:border [&_.tikz-diagram]:border-border [&_.tikz-diagram]:bg-white [&_.tikz-diagram]:p-4 [&_.tikz-diagram]:text-slate-900 [&_.tikz-diagram-status]:animate-pulse [&_.tikz-diagram-status]:py-8 [&_.tikz-diagram-status]:text-center [&_.tikz-diagram-status]:text-sm [&_.tikz-diagram-status]:font-medium [&_.tikz-diagram-status]:text-slate-500 [&_.tikz-diagram-error]:text-sm [&_.tikz-diagram-error]:font-medium [&_.tikz-diagram-error]:text-red-700 [&_.tikz-diagram_.tikzjax-wrapper]:mx-auto [&_.tikz-diagram_.tikzjax-wrapper]:max-w-full [&_.tikz-diagram_svg]:h-auto [&_.tikz-diagram_svg]:max-w-full [&_.tikz-diagram-source]:mt-3 [&_.tikz-diagram-source]:border-t [&_.tikz-diagram-source]:border-slate-200 [&_.tikz-diagram-source]:pt-2 [&_.tikz-diagram-source_summary]:cursor-pointer [&_.tikz-diagram-source_summary]:text-xs [&_.tikz-diagram-source_summary]:font-semibold [&_.tikz-diagram-source_summary]:text-slate-500 [&_.tikz-diagram-source_summary:hover]:text-slate-900 [&_.tikz-diagram-source_pre]:mt-2 [&_.tikz-diagram-source_pre]:max-h-72 [&_.tikz-diagram-source_pre]:overflow-auto [&_.tikz-diagram-source_pre]:rounded-md [&_.tikz-diagram-source_pre]:bg-slate-950 [&_.tikz-diagram-source_pre]:p-3 [&_.tikz-diagram-source_pre]:text-xs [&_.tikz-diagram-source_pre]:leading-5 [&_.tikz-diagram-source_pre]:text-slate-100 ";

const TIKZJAX_ROOT = "https://unpkg.com/@rod2ik/tikzjax@1.5.0/dist";
let tikzJaxLoader: Promise<void> | null = null;

declare global {
  interface Window {
    TikzJax?: boolean;
    TikzJaxOptions?: Record<string, unknown>;
  }
}

type TikzMarkdown = {
  markdown: string;
  diagrams: string[];
};

function loadTikzJax(): Promise<void> {
  if (window.TikzJax) return Promise.resolve();
  if (tikzJaxLoader) return tikzJaxLoader;

  tikzJaxLoader = new Promise<void>((resolve, reject) => {
    window.TikzJaxOptions = {
      assetBaseUrl: TIKZJAX_ROOT,
      renderTimeout: 20_000,
      maxRetries: 1,
      theme: { fallbackTheme: "light" },
    };

    if (!document.querySelector("link[data-tikzjax-fonts]")) {
      const fonts = document.createElement("link");
      fonts.rel = "stylesheet";
      fonts.href = `${TIKZJAX_ROOT}/fonts.css`;
      fonts.dataset.tikzjaxFonts = "true";
      document.head.appendChild(fonts);
    }

    const existing = document.querySelector<HTMLScriptElement>("script[data-tikzjax-loader]");
    const script = existing ?? document.createElement("script");
    const loaded = () => (window.TikzJax ? resolve() : reject(new Error("TikZ renderer did not initialize")));
    script.addEventListener("load", loaded, { once: true });
    script.addEventListener("error", () => reject(new Error("Could not load the TikZ renderer")), { once: true });

    if (!existing) {
      script.src = `${TIKZJAX_ROOT}/tikzjax.js`;
      script.async = true;
      script.dataset.tikzjaxLoader = "true";
      document.head.appendChild(script);
    }
  }).catch((error) => {
    tikzJaxLoader = null;
    document.querySelector("script[data-tikzjax-loader]")?.remove();
    throw error;
  });

  return tikzJaxLoader;
}

function diagramPlaceholder(index: number) {
  return [
    `<figure data-tikz-diagram="${index}" data-theme="light" class="tikz-diagram" aria-label="Technical diagram rendered from TikZ">`,
    '<div class="tikz-diagram-status">Rendering diagram...</div>',
    "</figure>",
  ].join("");
}

function diagramToken(index: number) {
  return `@@TIKZ_DIAGRAM_${index}@@`;
}

function extractTikzMarkdown(text: string): TikzMarkdown {
  const diagrams: string[] = [];
  const placeholder = (source: string) => {
    const index = diagrams.push(source.trim()) - 1;
    return `\n${diagramToken(index)}\n`;
  };

  let markdown = text.replace(
    /```(?:latex|tex|tikz)(?:[ \t]*\r?\n|[ \t]+)([\s\S]*?\\begin\{(tikzpicture|circuitikz)\}[\s\S]*?\\end\{\2\}[\s\S]*?)```/gi,
    (_match, source: string) => placeholder(source),
  );

  markdown = markdown.replace(
    /\\begin\{(tikzpicture|circuitikz)\}(?:\[[^\n\]]*\])?[\s\S]*?\\end\{\1\}/gi,
    (source: string) => placeholder(source),
  );

  return { markdown, diagrams };
}

function waitForDiagram(figure: HTMLElement): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const hasRenderedSvg = () =>
      Boolean(figure.querySelector(".tikzjax-wrapper:not(.tikzjax-loading):not(.tikzjax-broken-wrapper) svg"));
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      observer.disconnect();
      window.clearTimeout(timeout);
      figure.removeEventListener("tikzjax-load-finished", loaded);
      if (error) reject(error);
      else resolve();
    };
    const loaded = () => {
      window.setTimeout(() => {
        if (hasRenderedSvg()) finish();
        else if (figure.querySelector(".tikzjax-broken-wrapper, .tikzjax-error")) {
          finish(new Error("TikZ rendering failed."));
        }
      }, 50);
    };
    const observer = new MutationObserver(() => {
      if (figure.querySelector(".tikzjax-broken-wrapper, .tikzjax-error")) {
        finish(new Error("TikZ rendering failed."));
        return;
      }
      if (hasRenderedSvg()) {
        finish();
      }
    });
    const timeout = window.setTimeout(() => finish(new Error("TikZ rendering timed out.")), 25_000);
    figure.addEventListener("tikzjax-load-finished", loaded, { once: true });
    observer.observe(figure, { childList: true, subtree: true });
  });
}

function showDiagramFailure(figure: HTMLElement, source: string, message: string) {
  figure.replaceChildren();
  const notice = document.createElement("p");
  notice.className = "tikz-diagram-error";
  notice.textContent = message;
  figure.appendChild(notice);
  addSourceDisclosure(figure, source);
}

function addSourceDisclosure(figure: HTMLElement, source: string) {
  const details = document.createElement("details");
  details.className = "tikz-diagram-source";
  const summary = document.createElement("summary");
  summary.textContent = "View TikZ source";
  const pre = document.createElement("pre");
  const code = document.createElement("code");
  code.textContent = source;
  pre.appendChild(code);
  details.append(summary, pre);
  figure.appendChild(details);
}

export const Markdown = React.memo(function Markdown({ text, className = "" }: { text: string; className?: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const rendered = useMemo(() => {
    const extracted = extractTikzMarkdown(text);
    let html = renderMarkdown(extracted.markdown);
    extracted.diagrams.forEach((_source, index) => {
      const token = diagramToken(index);
      html = html
        .replace(`<p>${token}</p>`, diagramPlaceholder(index))
        .replace(token, diagramPlaceholder(index));
    });
    return { html, diagrams: extracted.diagrams };
  }, [text]);

  React.useEffect(() => {
    const root = rootRef.current;
    if (!root || rendered.diagrams.length === 0) return;

    let cancelled = false;
    const timeout = window.setTimeout(async () => {
      const figures: HTMLElement[] = [];
      const renderPromises: Promise<void>[] = [];

      rendered.diagrams.forEach((source, index) => {
        const figure = root.querySelector<HTMLElement>(`[data-tikz-diagram="${index}"]`);
        if (!figure) return;
        Array.from(figure.querySelectorAll("script[type='text/tikz'], .tikzjax-wrapper, .tikzjax-error, .tikz-diagram-source")).forEach((node) =>
          node.remove(),
        );

        const script = document.createElement("script");
        script.type = "text/tikz";
        
        let processedSource = source;
        // Inject common libraries if not already present
        if (!processedSource.includes("\\usetikzlibrary")) {
          processedSource = "\\usetikzlibrary{automata,positioning,arrows,shapes.geometric,calc}\n" + processedSource;
        }
        
        if (/\\begin\{circuitikz\}/i.test(source)) {
          script.dataset.texPackages = "circuitikz";
        }
        script.textContent = processedSource;

        renderPromises.push(new Promise((resolve, reject) => {
          const hasRenderedSvg = () =>
            Boolean(figure.querySelector(".tikzjax-wrapper:not(.tikzjax-loading):not(.tikzjax-broken-wrapper) svg"));

          const checkInterval = window.setInterval(() => {
            if (hasRenderedSvg()) {
              window.clearInterval(checkInterval);
              resolve();
            }
          }, 50);

          // Store the interval ID on the figure so we can clear it in cleanup
          (figure as any)._tikzCheckInterval = checkInterval;

          window.setTimeout(() => {
            window.clearInterval(checkInterval);
            if (!hasRenderedSvg()) {
              reject(new Error("TikZ rendering failed."));
            }
          }, 25000);
          
          figure.appendChild(script);
          figures.push(figure);
        }));
      });

      if (figures.length === 0) return;
      const rendering = Promise.all(renderPromises);

      try {
        await loadTikzJax();
        await rendering;
        if (cancelled) return;
        figures.forEach((figure) => {
          const index = Number(figure.dataset.tikzDiagram);
          figure.querySelector(".tikz-diagram-status")?.remove();
          addSourceDisclosure(figure, rendered.diagrams[index]);
        });
      } catch (caught) {
        if (cancelled) return;
        const message = caught instanceof Error ? caught.message : "TikZ rendering failed.";
        figures.forEach((figure) => {
          const index = Number(figure.dataset.tikzDiagram);
          if (figure.querySelector(".tikzjax-wrapper:not(.tikzjax-loading):not(.tikzjax-broken-wrapper) svg")) {
            figure.querySelector(".tikz-diagram-status")?.remove();
            addSourceDisclosure(figure, rendered.diagrams[index]);
          } else {
            showDiagramFailure(figure, rendered.diagrams[index], message);
          }
        });
      }
    }, 650);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      const allFigures = root.querySelectorAll<HTMLElement>("[data-tikz-diagram]");
      allFigures.forEach((figure) => {
        if ((figure as any)._tikzCheckInterval) {
          window.clearInterval((figure as any)._tikzCheckInterval);
        }
      });
    };
  }, [rendered]);

  return (
    <div
      ref={rootRef}
      className={MARKDOWN_CLASS + className}
      dangerouslySetInnerHTML={{ __html: rendered.html }}
    />
  );
});
