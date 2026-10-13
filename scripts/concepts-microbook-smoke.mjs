// Exercises the real reader in a local browser without accounts or remote APIs.
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile, rm } from "node:fs/promises";
import { globSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createServer } from "vite";
import tailwind from "@tailwindcss/postcss";
import puppeteer from "puppeteer";

const root = process.cwd();
const directory = path.join(root, "test-results", "concepts-microbook");
const harness = path.join(directory, "harness");
await mkdir(harness, { recursive: true });
const fixture = JSON.parse(
  await readFile(path.join(root, "tests/fixtures/concept-microbook.json"), "utf8"),
);
const reading = [
  fixture.introduction,
  ...fixture.sections.flatMap((section, index) => [
    `### ${index + 1}. ${section.heading}`,
    section.body,
    ...section.activities.map(
      (activity) => `\`\`\`concept-activity\n${JSON.stringify(activity)}\n\`\`\``,
    ),
  ]),
];
await writeFile(
  path.join(harness, "index.html"),
  '<!DOCTYPE html><html data-theme="light"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="/main.tsx"></script></body></html>',
);
await writeFile(
  path.join(harness, "main.tsx"),
  `
import React from "react";
import { createRoot } from "react-dom/client";
import { ConceptsCard } from "@/components/concepts-reading";
import "@/app/globals.css";
document.documentElement.style.setProperty("--font-inter", "Arial, sans-serif");
createRoot(document.getElementById("root")!).render(<main style={{padding: 32}}><ConceptsCard source={${JSON.stringify({ id: fixture.id, title: fixture.title, subjectName: fixture.subjectName, reading })}} /><section data-legacy-lesson><ConceptsCard source={{id:"legacy-notes",title:"Ohm’s law",subjectName:"Circuits",reading:["### Ohm’s law","- $V=IR$.\\n- Resistance is measured in ohms."]}} /></section><section data-bits-lesson><ConceptsCard source={{id:"bit-lab",title:"Two’s complement: build and inspect",subjectName:"Number Systems",reading:["### Eight-bit representation","- The sign bit has a negative weight in two’s complement.\\n- The same bit pattern can be interpreted as signed or unsigned.",${JSON.stringify("```concept-activity\n" + JSON.stringify({ kind: "bits", title: "Build minus five", prompt: "Toggle the bits and observe how the decimal and hexadecimal representations change.", bit_width: 8, initial: 0, target_value: -5, interpretation: "twos-complement", explanation: "11111011 has unsigned value 251. In eight-bit two’s complement, subtract 256 to obtain -5." }) + "\n```")}]}} /></section></main>);
`,
);
let server, browser;
const errors = [];
try {
  server = await createServer({
    configFile: false,
    root: harness,
    publicDir: path.join(root, "public"),
    resolve: { alias: { "@": root } },
    oxc: { jsx: { runtime: "automatic" } },
    plugins: [
      {
        name: "harness-css-import-order",
        enforce: "pre",
        transform(code, id) {
          if (!id.endsWith("/app/globals.css")) return;
          return code
            .replace('@import "tw-animate-css";', "")
            .replace(
              '@import "tailwindcss" source(none);',
              '@import "tailwindcss" source(none);\n@import "tw-animate-css";',
            );
        },
      },
    ],
    css: { postcss: { plugins: [tailwind()] } },
    server: { host: "127.0.0.1", port: 0, fs: { allow: [root] } },
  });
  await server.listen();
  const port = server.httpServer.address().port;
  const chrome = globSync("chromium-*/chrome-linux*/chrome", {
    cwd: path.join(os.homedir(), ".cache/ms-playwright"),
  })[0];
  browser = await puppeteer.launch({
    headless: true,
    executablePath:
      process.env.PUPPETEER_EXECUTABLE_PATH ||
      (chrome && path.join(os.homedir(), ".cache/ms-playwright", chrome)),
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage();
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewport({ width: 1440, height: 960 });
  await page.goto(`http://127.0.0.1:${port}`);
  await page.waitForSelector("button[aria-haspopup=dialog]");
  await page.click("button[aria-haspopup=dialog]");
  await page.waitForSelector('[data-concept-activity="diagram"]');
  await page.select("[role=dialog] select", "plain");
  const click = async (label, selector = "button") => {
    const handle = await page.evaluateHandle(
      (label, selector) =>
        Array.from(document.querySelectorAll(selector)).find(
          (element) => element.textContent.trim() === label,
        ),
      label,
      selector,
    );
    assert(handle.asElement(), `Control exists: ${label}`);
    await handle.asElement().click();
    await handle.dispose();
  };
  const progress = async (count) =>
    page.waitForFunction(
      (count) =>
        document.querySelector("nav").textContent.includes(`${count} / 6 activities completed`),
      {},
      count,
    );
  // The existing note presentation stays in place.
  assert(await page.$("article.answer-paper"));
  assert.equal(
    await page.evaluate(() => document.activeElement.getAttribute("aria-label")),
    "Close concepts",
  );
  await page.keyboard.down("Shift");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.up("Shift");
  assert.equal(await page.evaluate(() => document.activeElement.tagName), "TEXTAREA");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  assert.equal(
    await page.evaluate(() => document.activeElement.getAttribute("aria-label")),
    "Close concepts",
  );
  for (const label of ["Yoke", "Field winding", "Armature", "Commutator", "Brushes"])
    await click(label, '[data-concept-activity="diagram"] button');
  await progress(1);
  await click("Recall part functions");
  await click("Brushes", '[data-concept-activity="diagram"] button');
  await progress(0);
  for (const label of ["Yoke", "Field winding", "Armature", "Commutator", "Brushes"])
    await click(label, '[data-concept-activity="diagram"] button');
  await progress(1);
  await click("Explore parts");
  await click("1. Construction", "nav button");
  await page.screenshot({ path: path.join(directory, "desktop-construction.png") });
  for (let n = 0; n < 3; n++) await click("Show next step");
  await progress(1); // Revealing content alone is not completion.
  await page.type(
    '[data-concept-activity="derivation"] textarea',
    "Start with flux cut per turn, derive EMF, then use converted power and angular speed to find torque.",
  );
  await click("I can explain each step");
  await progress(2);
  await click("Torque keeps the same direction.", '[data-concept-activity="choice"] button');
  assert(
    !(await page.$eval('[data-concept-activity="choice"]', (element) =>
      element.textContent.includes("Not quite"),
    )),
  );
  await click("Check my choice");
  assert(
    await page.$eval('[data-concept-activity="choice"]', (element) =>
      element.textContent.includes("Not quite"),
    ),
  );
  await click("Torque reverses direction.", '[data-concept-activity="choice"] button');
  await click("Check my choice");
  await progress(3);
  await page.select('[data-concept-activity="experiment"] select', "Ia");
  await click("Increases", '[data-concept-activity="experiment"] button');
  await click("Record prediction");
  const currentSlider = (
    await page.$$('[data-concept-activity="experiment"] input[type=range]')
  )[1];
  await currentSlider.focus();
  await page.keyboard.press("ArrowRight");
  await click("Compare prediction");
  assert(
    await page.$eval('[data-concept-activity="experiment"]', (element) =>
      element.textContent.includes("differs from your prediction"),
    ),
  );
  await progress(3);
  await click("Try a new prediction");
  await click("Decreases", '[data-concept-activity="experiment"] button');
  await click("Record prediction");
  await currentSlider.focus();
  await page.keyboard.press("ArrowRight");
  await click("Compare prediction");
  await progress(4);
  assert(
    await page.$eval('[data-concept-activity="experiment"] svg[role=img]', (element) =>
      element.getAttribute("aria-label").includes("Armature current"),
    ),
  );
  await page.type("input[type=number]", "220");
  await click("Check answer");
  assert(
    await page.$eval('[data-concept-activity="numeric"]', (element) =>
      element.textContent.includes("Not quite"),
    ),
  );
  await page.click("input[type=number]");
  await page.keyboard.down("Control");
  await page.keyboard.press("a");
  await page.keyboard.up("Control");
  await page.keyboard.press("Backspace");
  await page.type("input[type=number]", "215");
  await click("Check answer");
  await progress(5);
  await click("3. Motor lab", "nav button");
  await page.screenshot({ path: path.join(directory, "desktop-lab.png") });
  assert(await page.$eval('[data-concept-activity="exam"] button', (element) => element.disabled));
  await page.type(
    '[data-concept-activity="exam"] textarea',
    "The field system supplies flux; brushes and commutator maintain coil current. Derive EMF from flux cutting, then use power to get torque.",
  );
  await click("Show model answer", '[data-concept-activity="exam"] summary');
  const checks = await page.$$('[data-concept-activity="exam"] input[type=checkbox]');
  for (const check of checks) await check.click();
  await click("I reviewed my answer");
  await progress(6);
  // Existing notes gain recall without changing or regenerating their text.
  const section = await page.evaluate(() =>
    Array.from(document.querySelectorAll("[data-concept-section]"))
      .find((element) => element.querySelector('[data-concept-activity="experiment"]'))
      .getAttribute("data-concept-section"),
  );
  const recall = `[data-concept-section="${section}"] [data-concept-recall]`;
  await click("Cover notes and try", `${recall} button`);
  assert(
    await page.$eval(
      `[data-concept-section="${section}"] [data-concept-activity="experiment"]`,
      (element) => element.getClientRects().length === 0,
    ),
  );
  await page.type(
    `${recall} textarea`,
    "Back EMF equals supply voltage minus the armature resistance drop; increasing current reduces back EMF.",
  );
  await click("Show notes to compare", `${recall} button`);
  await click("I need another pass", `${recall} button`);
  await click("Review difficult sections (1)", "nav button");
  assert.equal(
    await page.$$eval(
      "[data-concept-section]",
      (elements) => elements.filter((e) => !e.hidden).length,
    ),
    1,
  );
  await click("Show all sections", "nav button");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
  assert.equal(
    await page.evaluate(() => document.activeElement.textContent.trim()),
    "Read concepts",
  );
  assert.equal(await page.evaluate(() => document.body.style.overflow), "");
  await page.click("button[aria-haspopup=dialog]");
  await progress(6);
  await page.waitForFunction(
    (selector) => document.querySelector(selector).value.includes("Back EMF equals"),
    {},
    `${recall} textarea`,
  );
  assert.equal(
    await page.$eval('[data-concept-activity="numeric"] input', (element) => element.value),
    "215",
  );
  assert.equal(
    await page.$eval('[data-concept-activity="derivation"] textarea', (element) =>
      element.value.includes("flux cut"),
    ),
    true,
  );
  await page.setViewport({ width: 390, height: 844 });
  await click("3. Motor lab · Revisit", "nav button");
  assert(
    await page.evaluate(
      () => document.querySelector('[role="dialog"]').scrollWidth <= window.innerWidth,
    ),
  );
  await page.screenshot({ path: path.join(directory, "mobile-lab.png") });
  await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
  await page.waitForFunction(
    () =>
      getComputedStyle(document.querySelector('[role="dialog"]')).backgroundColor ===
      "rgb(18, 18, 20)",
  );
  await page.screenshot({ path: path.join(directory, "mobile-lab-dark.png") });
  // A second topic contains only existing notes: no generated activity data.
  await page.keyboard.press("Escape");
  await page.evaluate(() => (document.documentElement.dataset.theme = "light"));
  await page.click("[data-legacy-lesson] button[aria-haspopup=dialog]");
  await page.waitForSelector("[data-concept-recall] textarea");
  assert(await page.$("article.answer-paper"));
  assert.equal(await page.$$eval("[data-concept-activity]", (elements) => elements.length), 0);
  assert(
    await page.$eval("article", (element) =>
      element.textContent.includes("Resistance is measured in ohms."),
    ),
  );
  await click("Cover notes and try", "[data-concept-recall] button");
  await page.type(
    "[data-concept-recall] textarea",
    "Voltage is current times resistance; resistance is measured in ohms.",
  );
  await click("Show notes to compare", "[data-concept-recall] button");
  await click("I can explain this", "[data-concept-recall] button");
  await page.screenshot({ path: path.join(directory, "existing-notes-recall.png") });
  await page.keyboard.press("Escape");
  await page.setViewport({ width: 900, height: 960 });
  await page.click("[data-bits-lesson] button[aria-haspopup=dialog]");
  await page.waitForSelector('[data-concept-activity="bits"]');
  await click("Check bit pattern");
  assert(
    await page.$eval('[data-concept-activity="bits"]', (element) =>
      element.textContent.includes("Not quite"),
    ),
  );
  for (const position of [7, 6, 5, 4, 3, 1, 0])
    await page.click(`[aria-label="Bit ${position}${position === 7 ? " (sign bit)" : ""}"]`);
  assert.deepEqual(
    await page.$$eval('[data-concept-activity="bits"] dd', (elements) =>
      elements.map((e) => e.textContent),
    ),
    ["251", "-5", "FB", "11111011"],
  );
  await click("Check bit pattern");
  assert(
    await page.$eval('[data-concept-activity="bits"]', (element) =>
      element.textContent.includes("Correct bit pattern."),
    ),
  );
  await page.screenshot({ path: path.join(directory, "binary-lab.png") });
  assert.deepEqual(errors, [], "No browser errors");
  console.log(
    "Microbook reader passed: predict-check-retry, diagram recall, section recall/review, stored drafts, preserved notes, keyboard/focus, desktop/mobile and dark mode.",
  );
  console.log(`Screenshots: ${directory}`);
} finally {
  await browser?.close();
  await server?.close();
  await rm(harness, { recursive: true, force: true });
}
