import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { QrZoom } from "@/components/qr-zoom";

describe("the payment QR", () => {
  const html = renderToStaticMarkup(
    createElement(QrZoom, { src: "https://x/qr.png", alt: "Official Bank payment QR" } as ComponentProps<typeof QrZoom>, "thumb"),
  );

  it("opens full screen from a button around the thumbnail", () => {
    expect(html).toContain('type="button"');
    expect(html).toContain('aria-label="Open Official Bank payment QR full screen"');
    expect(html).toContain("thumb");
  });

  it("uses a native modal dialog, closed until it is tapped", () => {
    expect(html).toMatch(/<dialog[^>]*aria-label="Official Bank payment QR"/);
    expect(html).not.toContain("<dialog open");
    expect(html).not.toContain("<img");
  });
});
