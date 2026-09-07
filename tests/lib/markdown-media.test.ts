import { describe, expect, it } from "vitest";
import { renderMarkdown } from "@/lib/markdown";

describe("answer media", () => {
  it("renders a backend figure as an image", () => {
    const html = renderMarkdown("![Diagram](/api/figure/7437faa8.png)");
    expect(html).toContain('<img src="/api/figure/7437faa8.png"');
    expect(html).toContain('alt="Diagram"');
    expect(html).toContain('loading="lazy"');
  });

  it("renders an animation poster", () => {
    const html = renderMarkdown("![RC curve](/api/media/c9c38460/poster.png)");
    expect(html).toContain('src="/api/media/c9c38460/poster.png"');
  });

  it("renders links, and marks external ones", () => {
    expect(renderMarkdown("[docs](/app/notes)")).toContain('<a href="/app/notes">docs</a>');
    const ext = renderMarkdown("[site](https://example.com)");
    expect(ext).toContain('target="_blank"');
    expect(ext).toContain('rel="noopener noreferrer"');
  });

  it("keeps emphasis inside a link label", () => {
    expect(renderMarkdown("[**Ohm** law](/x)")).toContain("<strong>Ohm</strong>");
  });

  it("refuses a javascript: url", () => {
    // The rejected link degrades to its own literal source text, which is inert:
    // what must never happen is the scheme reaching an href.
    const html = renderMarkdown("[click](javascript:alert(1))");
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("href");
  });

  it("refuses a protocol-relative url", () => {
    expect(renderMarkdown("[x](//evil.test/a)")).not.toContain("<a ");
  });

  it("falls back to alt text for an unsafe image src", () => {
    const html = renderMarkdown("![a picture](data:image/svg+xml;base64,AAA)");
    expect(html).not.toContain("<img");
    expect(html).toContain("a picture");
  });

  it("cannot break out of the src attribute", () => {
    const html = renderMarkdown('![x](/api/tikz/a.png"onerror="alert(1))');
    expect(html).not.toContain('onerror="alert');
  });

  it("leaves markdown inside a code span alone", () => {
    const html = renderMarkdown("`![x](/y.png)`");
    expect(html).not.toContain("<img");
    expect(html).toContain("<code>");
  });
});
