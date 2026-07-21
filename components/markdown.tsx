"use client";

import { renderMarkdown } from "@/lib/markdown";
import React, { useMemo, useState } from "react";

const MARKDOWN_CLASS =
  "max-w-full overflow-hidden break-words text-sm leading-relaxed text-text-primary [&_h1]:mt-6 [&_h1]:mb-3 [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:mt-5 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-bold [&_h3]:mt-4 [&_h3]:mb-2 [&_h3]:text-lg [&_h3]:font-semibold [&_h4]:mt-3 [&_h4]:mb-2 [&_h4]:text-base [&_h4]:font-semibold [&_strong]:font-semibold [&_em]:italic [&_code]:font-mono-ui [&_code]:rounded [&_code]:bg-bg-tertiary [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[12px] [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-border [&_pre]:bg-bg-tertiary [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_table]:my-4 [&_table]:block [&_table]:w-fit [&_table]:max-w-full [&_table]:overflow-x-auto [&_table]:border-collapse [&_table]:text-left [&_thead]:bg-bg-tertiary [&_th]:min-w-20 [&_th]:border [&_th]:border-border [&_th]:px-5 [&_th]:py-3 [&_th]:text-[15px] [&_th]:font-semibold [&_td]:min-w-20 [&_td]:border [&_td]:border-border [&_td]:px-5 [&_td]:py-3.5 [&_td]:text-[15px] [&_td]:font-medium [&_tbody_tr:nth-child(even)]:bg-bg-tertiary/40 [&_.math-inline]:align-baseline [&_.math-inline]:break-normal [&_.math-block]:my-3 [&_.math-block]:max-w-full [&_.math-block]:overflow-x-auto [&_.math-block]:rounded-lg [&_.math-block]:border [&_.math-block]:border-border [&_.math-block]:bg-bg-tertiary [&_.math-block]:p-3 [&_.math-block]:text-center [&_.math-block_.katex-display]:my-0 [&_ol]:ml-5 [&_ol]:list-decimal [&_ul]:ml-5 [&_ul]:list-disc [&_li]:mt-1 [&_p]:mt-2 first:[&_p]:mt-0 ";

type MarkdownSegment =
  | { type: "markdown"; text: string }
  | { type: "tikz"; source: string };

type CircuitGate = {
  id: string;
  kind: string;
  x: number;
  y: number;
};

type CircuitLabel = {
  text: string;
  x: number;
  y: number;
  align: "start" | "end";
};

type CircuitCoordRef = {
  id: string;
  gateId: string;
  dx: number;
};

type CircuitWire =
  | {
      type: "input";
      fromX: number;
      fromY: number;
      gateId: string;
      inputIndex: number;
      label?: string;
    }
  | {
      type: "tap";
      fromX: number;
      fromY: number;
      gateId: string;
      inputIndex: number;
    }
  | {
      type: "output";
      gateId: string;
      dx: number;
      label?: string;
    }
  | {
      type: "gate";
      fromGateId: string;
      toGateId: string;
      inputIndex: number;
    }
  | {
      type: "gateRoute";
      fromGateId: string;
      dx: number;
      toGateId: string;
      inputIndex: number;
    }
  | {
      type: "coord";
      fromX: number;
      fromY: number;
      gateId: string;
      inputIndex: number;
    }
  | {
      type: "feedback";
      coordId: string;
      dx: number;
      dy: number;
      gateId: string;
      inputIndex: number;
    };

type CircuitDiagram = {
  gates: CircuitGate[];
  wires: CircuitWire[];
  labels: CircuitLabel[];
  coordRefs: CircuitCoordRef[];
};

type BlockBox = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

type BlockNode = {
  x: number;
  y: number;
  text: string;
  shape?: "circle";
  placement?: "left" | "right" | "above" | "below";
};

type BlockArrow = {
  direction: "input" | "output";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  label?: string;
  labelPlacement?: "left" | "right" | "above" | "below" | "midway";
};

type BlockWire = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  label?: string;
};

type BlockDiagram = {
  boxes: BlockBox[];
  nodes: BlockNode[];
  arrows: BlockArrow[];
  wires: BlockWire[];
};

function isTikzSource(source: string) {
  if (/\\begin\{(?:tikzpicture|circuitikz)\}[\s\S]*?\\end\{(?:tikzpicture|circuitikz)\}/.test(source)) {
    return true;
  }

  const hasTikzCommands = /\\(?:node|draw|fill)\b/.test(source);
  const hasCircuitikzGate = /\[[^\]]*\b(?:and|or|nand|nor|xor|xnor|not|buffer)\s+port\b/.test(source);
  return hasTikzCommands && hasCircuitikzGate;
}

function parseNumber(value: string) {
  const parsed = Number.parseFloat(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function cleanCircuitLabel(value: string) {
  return value
    .trim()
    .replace(/^\{|\}$/g, "")
    .replace(/\\begin\{tabular\}\{[^}]*\}/g, "")
    .replace(/\\end\{tabular\}/g, "")
    .replace(/\\\\/g, " ")
    .replace(/\\overline\s*\{([^}]+)\}/g, "$1\u0305")
    .replace(/\\bar\s*\{([^}]+)\}/g, "$1\u0305")
    .replace(/\$/g, "")
    .replace(/\\_/g, "_")
    .replace(/_\{([^}]+)\}/g, "_$1")
    .replace(/\\([A-Za-z]+)/g, "$1")
    .replace(/[{}]/g, "");
}

function parseBlockDiagram(source: string): BlockDiagram | null {
  const boxes: BlockBox[] = [];
  const nodes: BlockNode[] = [];
  const arrows: BlockArrow[] = [];
  const wires: BlockWire[] = [];

  const rectanglePattern =
    /\\draw(?:\[[^\]]*\])?\s*\(\s*([-+]?\d*\.?\d+)\s*,\s*([-+]?\d*\.?\d+)\s*\)\s*rectangle\s*\(\s*([-+]?\d*\.?\d+)\s*,\s*([-+]?\d*\.?\d+)\s*\)/gi;
  for (const match of source.matchAll(rectanglePattern)) {
    const x1 = parseNumber(match[1]);
    const y1 = parseNumber(match[2]);
    const x2 = parseNumber(match[3]);
    const y2 = parseNumber(match[4]);
    if (x1 === null || y1 === null || x2 === null || y2 === null) continue;
    boxes.push({ x1, y1, x2, y2 });
  }

  const rectangleWithLabelPattern =
    /\\draw(?:\[[^\]]*\])?\s*\(\s*([-+]?\d*\.?\d+)\s*,\s*([-+]?\d*\.?\d+)\s*\)\s*rectangle\s*\(\s*([-+]?\d*\.?\d+)\s*,\s*([-+]?\d*\.?\d+)\s*\)\s*node\[[^\]]*\]\s*(\{[^\n;]+\})/gi;
  for (const match of source.matchAll(rectangleWithLabelPattern)) {
    const x1 = parseNumber(match[1]);
    const y1 = parseNumber(match[2]);
    const x2 = parseNumber(match[3]);
    const y2 = parseNumber(match[4]);
    if (x1 === null || y1 === null || x2 === null || y2 === null) continue;
    nodes.push({ x: (x1 + x2) / 2, y: (y1 + y2) / 2, text: cleanCircuitLabel(match[5]) });
  }

  const nodePattern =
    /\\node\s+at\s*\(\s*([-+]?\d*\.?\d+)\s*,\s*([-+]?\d*\.?\d+)\s*\)\s*(\{[^\n;]+\})/gi;
  for (const match of source.matchAll(nodePattern)) {
    const x = parseNumber(match[1]);
    const y = parseNumber(match[2]);
    if (x === null || y === null) continue;
    nodes.push({ x, y, text: cleanCircuitLabel(match[3]) });
  }

  const styledNodePattern =
    /\\node\s*\[([^\]]+)\]\s*at\s*\(\s*([-+]?\d*\.?\d+)\s*,\s*([-+]?\d*\.?\d+)\s*\)\s*(\{[^\n;]+\})/gi;
  for (const match of source.matchAll(styledNodePattern)) {
    const x = parseNumber(match[2]);
    const y = parseNumber(match[3]);
    if (x === null || y === null) continue;
    nodes.push({
      x,
      y,
      text: cleanCircuitLabel(match[4]),
      shape: match[1].includes("circle") ? "circle" : undefined,
      placement: match[1].includes("left")
        ? "left"
        : match[1].includes("right")
          ? "right"
          : match[1].includes("above")
            ? "above"
            : match[1].includes("below")
              ? "below"
              : undefined,
    });
  }

  const arrowPattern =
    /\\draw\s*\[\s*(<-|->)[^\]]*\]\s*\(\s*([-+]?\d*\.?\d+)\s*,\s*([-+]?\d*\.?\d+)\s*\)\s*--\s*\(\s*([-+]?\d*\.?\d+)\s*,\s*([-+]?\d*\.?\d+)\s*\)\s*node\[[^\]]*(left|right)[^\]]*\]\s*(\{[^\n;]+\})/gi;
  for (const match of source.matchAll(arrowPattern)) {
    const x1 = parseNumber(match[2]);
    const y1 = parseNumber(match[3]);
    const x2 = parseNumber(match[4]);
    const y2 = parseNumber(match[5]);
    if (x1 === null || y1 === null || x2 === null || y2 === null) continue;
    arrows.push({
      direction: match[1] === "<-" ? "input" : "output",
      x1,
      y1,
      x2,
      y2,
      label: cleanCircuitLabel(match[7]),
      labelPlacement: match[6] === "left" ? "left" : "right",
    });
  }

  const genericArrowPattern =
    /\\draw\s*\[\s*(<-|->)[^\]]*\]\s*\(\s*([-+]?\d*\.?\d+)\s*,\s*([-+]?\d*\.?\d+)\s*\)\s*--\s*\(\s*([-+]?\d*\.?\d+)\s*,\s*([-+]?\d*\.?\d+)\s*\)(?:\s*node\[([^\]]*)\]\s*(\{[^\n;]+\}))?/gi;
  for (const match of source.matchAll(genericArrowPattern)) {
    const x1 = parseNumber(match[2]);
    const y1 = parseNumber(match[3]);
    const x2 = parseNumber(match[4]);
    const y2 = parseNumber(match[5]);
    if (x1 === null || y1 === null || x2 === null || y2 === null) continue;
    const labelOptions = match[6] ?? "";
    const label = match[7] ? cleanCircuitLabel(match[7]) : undefined;
    const labelPlacement = labelOptions.includes("left")
      ? "left"
      : labelOptions.includes("right")
        ? "right"
        : labelOptions.includes("below")
          ? "below"
          : labelOptions.includes("above")
            ? "above"
            : labelOptions.includes("midway")
              ? "midway"
              : undefined;
    const alreadyCaptured = arrows.some(
      (arrow) => arrow.x1 === x1 && arrow.y1 === y1 && arrow.x2 === x2 && arrow.y2 === y2 && arrow.label === label,
    );
    if (!alreadyCaptured) {
      arrows.push({
        direction: match[1] === "<-" ? "input" : "output",
        x1,
        y1,
        x2,
        y2,
        label,
        labelPlacement,
      });
    }
  }

  const labeledWirePattern =
    /\\draw\s*\(\s*([-+]?\d*\.?\d+)\s*,\s*([-+]?\d*\.?\d+)\s*\)\s*node\[[^\]]*(left|right)[^\]]*\]\s*(\{[^\n;]+\})\s*--\s*\(\s*([-+]?\d*\.?\d+)\s*,\s*([-+]?\d*\.?\d+)\s*\)/gi;
  for (const match of source.matchAll(labeledWirePattern)) {
    const x1 = parseNumber(match[1]);
    const y1 = parseNumber(match[2]);
    const x2 = parseNumber(match[5]);
    const y2 = parseNumber(match[6]);
    if (x1 === null || y1 === null || x2 === null || y2 === null) continue;
    wires.push({ x1, y1, x2, y2, label: cleanCircuitLabel(match[4]) });
  }

  const plainWirePattern =
    /\\draw\s*\(\s*([-+]?\d*\.?\d+)\s*,\s*([-+]?\d*\.?\d+)\s*\)\s*--\s*\(\s*([-+]?\d*\.?\d+)\s*,\s*([-+]?\d*\.?\d+)\s*\)/gi;
  for (const match of source.matchAll(plainWirePattern)) {
    const x1 = parseNumber(match[1]);
    const y1 = parseNumber(match[2]);
    const x2 = parseNumber(match[3]);
    const y2 = parseNumber(match[4]);
    if (x1 === null || y1 === null || x2 === null || y2 === null) continue;
    const alreadyCaptured = wires.some((wire) => wire.x1 === x1 && wire.y1 === y1 && wire.x2 === x2 && wire.y2 === y2);
    if (!alreadyCaptured) wires.push({ x1, y1, x2, y2 });
  }

  const chainWirePattern = /\\draw\s+((?:\(\s*[-+]?\d*\.?\d+\s*,\s*[-+]?\d*\.?\d+\s*\)\s*--\s*)+\(\s*[-+]?\d*\.?\d+\s*,\s*[-+]?\d*\.?\d+\s*\))/gi;
  for (const match of source.matchAll(chainWirePattern)) {
    const coords = Array.from(match[1].matchAll(/\(\s*([-+]?\d*\.?\d+)\s*,\s*([-+]?\d*\.?\d+)\s*\)/g))
      .map((coord) => {
        const x = parseNumber(coord[1]);
        const y = parseNumber(coord[2]);
        return x === null || y === null ? null : { x, y };
      })
      .filter((coord): coord is { x: number; y: number } => Boolean(coord));

    for (let index = 0; index < coords.length - 1; index += 1) {
      const start = coords[index];
      const end = coords[index + 1];
      const alreadyCaptured = wires.some(
        (wire) => wire.x1 === start.x && wire.y1 === start.y && wire.x2 === end.x && wire.y2 === end.y,
      );
      if (!alreadyCaptured) wires.push({ x1: start.x, y1: start.y, x2: end.x, y2: end.y });
    }
  }

  const inlineNotPattern =
    /\\draw\s*\(\s*([-+]?\d*\.?\d+)\s*,\s*([-+]?\d*\.?\d+)\s*\)\s*--\s*\(\s*([-+]?\d*\.?\d+)\s*,\s*([-+]?\d*\.?\d+)\s*\)\s*to\[[^\]]*not\s+port[^,]*,\s*l=([^\]]+)\]\s*\(\s*([-+]?\d*\.?\d+)\s*,\s*([-+]?\d*\.?\d+)\s*\)/gi;
  for (const match of source.matchAll(inlineNotPattern)) {
    const x1 = parseNumber(match[1]);
    const y1 = parseNumber(match[2]);
    const x2 = parseNumber(match[3]);
    const y2 = parseNumber(match[4]);
    const x3 = parseNumber(match[6]);
    const y3 = parseNumber(match[7]);
    if (x1 === null || y1 === null || x2 === null || y2 === null || x3 === null || y3 === null) continue;
    wires.push({ x1, y1, x2, y2 });
    wires.push({ x1: x2, y1: y2, x2: x3, y2: y3, label: cleanCircuitLabel(match[5]) });
  }

  return boxes.length > 0 && (nodes.length > 0 || arrows.length > 0 || wires.length > 0)
    ? { boxes, nodes, arrows, wires }
    : null;
}

function parseGateDiagram(source: string): CircuitDiagram | null {
  const gates: CircuitGate[] = [];
  const wires: CircuitWire[] = [];
  const labels: CircuitLabel[] = [];
  const coordRefs: CircuitCoordRef[] = [];

  const gatePattern =
    /\\node\s*\[\s*([a-z]+)\s+port[^\]]*\]\s*\(([^)]+)\)\s*at\s*\(\s*([-+]?\d*\.?\d+)\s*,\s*([-+]?\d*\.?\d+)\s*\)/gi;
  for (const match of source.matchAll(gatePattern)) {
    const x = parseNumber(match[3]);
    const y = parseNumber(match[4]);
    if (x === null || y === null) continue;
    gates.push({ id: match[2].trim(), kind: match[1].toLowerCase(), x, y });
  }

  const drawNodeGatePattern =
    /\\draw\s*\(\s*([-+]?\d*\.?\d+)\s*,\s*([-+]?\d*\.?\d+)\s*\)\s*node\s*\[\s*([a-z]+)\s+port[^\]]*\]\s*\(([^)]+)\)/gi;
  for (const match of source.matchAll(drawNodeGatePattern)) {
    const x = parseNumber(match[1]);
    const y = parseNumber(match[2]);
    if (x === null || y === null) continue;
    const id = match[4].trim();
    if (!gates.some((gate) => gate.id === id)) {
      gates.push({ id, kind: match[3].toLowerCase(), x, y });
    }
  }

  const inputPattern =
    /\\draw\s*\(\s*([-+]?\d*\.?\d+)\s*,\s*([-+]?\d*\.?\d+)\s*\)\s*node\[left\]\s*\{([^}]*)\}\s*--\s*\(([^.]+)\.in\s+(\d+)\)/gi;
  for (const match of source.matchAll(inputPattern)) {
    const fromX = parseNumber(match[1]);
    const fromY = parseNumber(match[2]);
    const inputIndex = Number.parseInt(match[5], 10);
    if (fromX === null || fromY === null || !Number.isFinite(inputIndex)) continue;
    wires.push({
      type: "input",
      fromX,
      fromY,
      gateId: match[4].trim(),
      inputIndex,
      label: cleanCircuitLabel(match[3]),
    });
  }

  const tapPattern =
    /\\draw\s*\(\s*([-+]?\d*\.?\d+)\s*,\s*([-+]?\d*\.?\d+)\s*\)\s*node\[circ\]\s*\{\}\s*\|-\s*\(([^.]+)\.in\s+(\d+)\)/gi;
  for (const match of source.matchAll(tapPattern)) {
    const fromX = parseNumber(match[1]);
    const fromY = parseNumber(match[2]);
    const inputIndex = Number.parseInt(match[4], 10);
    if (fromX === null || fromY === null || !Number.isFinite(inputIndex)) continue;
    wires.push({ type: "tap", fromX, fromY, gateId: match[3].trim(), inputIndex });
  }

  const outputPattern =
    /\\draw\s*\(([^.]+)\.out\)\s*--\s*\+\+\(\s*([-+]?\d*\.?\d+)\s*,\s*[-+]?\d*\.?\d+\s*\)\s*node\[right\]\s*(\{[^\n;]+\})/gi;
  for (const match of source.matchAll(outputPattern)) {
    const dx = parseNumber(match[2]);
    if (dx === null) continue;
    wires.push({ type: "output", gateId: match[1].trim(), dx, label: cleanCircuitLabel(match[3]) });
  }

  const outputCoordinatePattern =
    /\\draw\s*\(([^.]+)\.out\)\s*--\s*\+\+\(\s*([-+]?\d*\.?\d+)\s*,\s*[-+]?\d*\.?\d+\s*\)\s*coordinate\s*\(([^)]+)\)\s*node\[right\]\s*(\{[^\n;]+\})/gi;
  for (const match of source.matchAll(outputCoordinatePattern)) {
    const dx = parseNumber(match[2]);
    if (dx === null) continue;
    const gateId = match[1].trim();
    const coordId = match[3].trim();
    wires.push({ type: "output", gateId, dx, label: cleanCircuitLabel(match[4]) });
    coordRefs.push({ id: coordId, gateId, dx });
  }

  const gatePatternDirect = /\\draw\s*\(([^.]+)\.out\)\s*--\s*\(([^.]+)\.in\s+(\d+)\)/gi;
  for (const match of source.matchAll(gatePatternDirect)) {
    const inputIndex = Number.parseInt(match[3], 10);
    if (!Number.isFinite(inputIndex)) continue;
    wires.push({
      type: "gate",
      fromGateId: match[1].trim(),
      toGateId: match[2].trim(),
      inputIndex,
    });
  }

  const gatePatternRoute =
    /\\draw\s*\(([^.]+)\.out\)\s*--\s*\+\+\(\s*([-+]?\d*\.?\d+)\s*,\s*[-+]?\d*\.?\d+\s*\)\s*\|-\s*\(([^.]+)\.in\s+(\d+)\)/gi;
  for (const match of source.matchAll(gatePatternRoute)) {
    const dx = parseNumber(match[2]);
    const inputIndex = Number.parseInt(match[4], 10);
    if (dx === null || !Number.isFinite(inputIndex)) continue;
    wires.push({
      type: "gateRoute",
      fromGateId: match[1].trim(),
      dx,
      toGateId: match[3].trim(),
      inputIndex,
    });
  }

  const coordPattern =
    /\\draw\s*\(\s*([-+]?\d*\.?\d+)\s*,\s*([-+]?\d*\.?\d+)\s*\)\s*--\s*\(([^.]+)\.in\s+(\d+)\)/gi;
  for (const match of source.matchAll(coordPattern)) {
    const fromX = parseNumber(match[1]);
    const fromY = parseNumber(match[2]);
    const inputIndex = Number.parseInt(match[4], 10);
    if (fromX === null || fromY === null || !Number.isFinite(inputIndex)) continue;
    wires.push({
      type: "coord",
      fromX,
      fromY,
      gateId: match[3].trim(),
      inputIndex,
    });
  }

  const feedbackPattern =
    /\\draw\s*\(([^)]+)\)\s*\+\+\(\s*([-+]?\d*\.?\d+)\s*,\s*[-+]?\d*\.?\d+\s*\)\s*--\s*\+\+\(\s*[-+]?\d*\.?\d+\s*,\s*([-+]?\d*\.?\d+)\s*\)\s*-\|\s*\(([^.]+)\.in\s+(\d+)\)/gi;
  for (const match of source.matchAll(feedbackPattern)) {
    const dx = parseNumber(match[2]);
    const dy = parseNumber(match[3]);
    const inputIndex = Number.parseInt(match[5], 10);
    if (dx === null || dy === null || !Number.isFinite(inputIndex)) continue;
    wires.push({
      type: "feedback",
      coordId: match[1].trim(),
      dx,
      dy,
      gateId: match[4].trim(),
      inputIndex,
    });
  }

  const labelPattern =
    /\\draw\s*\(\s*([-+]?\d*\.?\d+)\s*,\s*([-+]?\d*\.?\d+)\s*\)\s*node\[(left|right)\]\s*\{([^}]*)\}/gi;
  for (const match of source.matchAll(labelPattern)) {
    const x = parseNumber(match[1]);
    const y = parseNumber(match[2]);
    if (x === null || y === null) continue;
    labels.push({ text: cleanCircuitLabel(match[4]), x, y, align: match[3] === "left" ? "end" : "start" });
  }

  return gates.length > 0 ? { gates, wires, labels, coordRefs } : null;
}

function splitTikzSegments(source: string): MarkdownSegment[] {
  const segments: MarkdownSegment[] = [];
  const markdownBuffer: string[] = [];
  const lines = source.split(/(\r?\n)/);

  const pushMarkdown = () => {
    const text = markdownBuffer.join("");
    if (text) segments.push({ type: "markdown", text });
    markdownBuffer.length = 0;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const opening = line.match(/^([`~]{3,})[^\r\n]*$/);

    if (!opening) {
      markdownBuffer.push(line);
      continue;
    }

    const marker = opening[1];
    const fenceLines = [line];
    const contentLines: string[] = [];
    let foundClose = false;

    index += 1;
    for (; index < lines.length; index += 1) {
      const nextLine = lines[index];
      fenceLines.push(nextLine);
      const isClosingFence =
        nextLine.trim().startsWith(marker[0].repeat(marker.length)) &&
        nextLine.trim().replace(new RegExp(`^${marker[0]}+`), "").trim() === "";

      if (isClosingFence) {
        foundClose = true;
        break;
      }
      contentLines.push(nextLine);
    }

    const content = contentLines.join("").trim();
    if (foundClose && isTikzSource(content)) {
      pushMarkdown();
      segments.push({ type: "tikz", source: content });
    } else {
      markdownBuffer.push(fenceLines.join(""));
    }
  }

  pushMarkdown();

  return segments.length > 0 ? segments : [{ type: "markdown", text: source }];
}

function escapeScriptContent(value: string) {
  return value.replace(/<\/script/gi, "<\\/script");
}

function buildTikzDocument(source: string) {
  if (/\\begin\s*\{document\}/.test(source)) return source;
  if (!/\\begin\s*\{(?:tikzpicture|circuitikz)\}/.test(source)) {
    return `\\usepackage{circuitikz}\n\\begin{circuitikz}\n${source}\n\\end{circuitikz}`;
  }
  if (/\\begin\s*\{circuitikz\}/.test(source) && !/\\usepackage\s*(?:\[[^\]]*\])?\s*\{circuitikz\}/.test(source)) {
    return `\\usepackage{circuitikz}\n${source}`;
  }
  return source;
}

function buildTikzSrcDoc(source: string) {
  const tikzSource = escapeScriptContent(buildTikzDocument(source));
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="stylesheet" type="text/css" href="https://tikzjax.com/v1/fonts.css" />
  <style>
    html, body { margin: 0; background: transparent; color: #111827; }
    body { min-height: 180px; display: grid; place-items: center; padding: 18px; box-sizing: border-box; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    svg { max-width: 100%; height: auto; display: block; }
    .fallback { color: #6b7280; font-size: 13px; line-height: 1.5; text-align: center; }
  </style>
</head>
<body>
  <script type="text/tikz">
${tikzSource}
  </script>
  <script src="https://tikzjax.com/v1/tikzjax.js"></script>
  <script>
    const sendHeight = () => {
      const height = Math.max(180, Math.ceil(document.documentElement.scrollHeight || document.body.scrollHeight || 180));
      parent.postMessage({ type: "nano:tikz-height", height }, "*");
    };
    new MutationObserver(sendHeight).observe(document.body, { childList: true, subtree: true });
    window.addEventListener("load", () => {
      sendHeight();
      setTimeout(sendHeight, 1200);
      setTimeout(sendHeight, 3000);
    });
  </script>
</body>
</html>`;
}

function GateShape({ gate }: { gate: CircuitGate }) {
  const transform = `translate(${gate.x}, ${gate.y})`;

  if (gate.kind === "and") {
    return (
      <g transform={transform}>
        <path
          d="M -42 -34 L -8 -34 C 34 -34 48 -18 48 0 C 48 18 34 34 -8 34 L -42 34 Z"
          fill="#fff"
          stroke="#111827"
          strokeWidth="3"
        />
        <text x="4" y="8" textAnchor="middle" className="fill-slate-700 text-[18px] font-semibold">
          AND
        </text>
      </g>
    );
  }

  if (gate.kind === "xor") {
    return (
      <g transform={transform}>
        <path d="M -54 -34 C -34 -8 -34 8 -54 34" fill="none" stroke="#111827" strokeWidth="3" />
        <path
          d="M -40 -34 C -16 -30 22 -24 50 0 C 22 24 -16 30 -40 34 C -24 8 -24 -8 -40 -34 Z"
          fill="#fff"
          stroke="#111827"
          strokeWidth="3"
        />
        <text x="6" y="8" textAnchor="middle" className="fill-slate-700 text-[18px] font-semibold">
          XOR
        </text>
      </g>
    );
  }

  if (gate.kind === "or" || gate.kind === "nor") {
    return (
      <g transform={transform}>
        <path
          d="M -44 -34 C -18 -30 22 -24 50 0 C 22 24 -18 30 -44 34 C -24 8 -24 -8 -44 -34 Z"
          fill="#fff"
          stroke="#111827"
          strokeWidth="3"
        />
        <text x="6" y="8" textAnchor="middle" className="fill-slate-700 text-[18px] font-semibold">
          {gate.kind.toUpperCase()}
        </text>
        {gate.kind === "nor" ? <circle cx="58" cy="0" r="8" fill="#fff" stroke="#111827" strokeWidth="3" /> : null}
      </g>
    );
  }

  return (
    <g transform={transform}>
      <rect x="-42" y="-28" width="84" height="56" rx="8" fill="#fff" stroke="#111827" strokeWidth="3" />
      <text x="0" y="7" textAnchor="middle" className="fill-slate-700 text-[16px] font-semibold">
        {gate.kind.toUpperCase()}
      </text>
    </g>
  );
}

function BlockDiagramSvg({ diagram }: { diagram: BlockDiagram }) {
  const scale = 190;
  const toPoint = (x: number, y: number) => ({ x: x * scale, y: -y * scale });
  const isNear = (a: number, b: number) => Math.abs(a - b) < 0.04;
  const resolvePlacedNode = (node: BlockNode) => {
    const edgeBox = diagram.boxes.find((box) => {
      const left = Math.min(box.x1, box.x2);
      const right = Math.max(box.x1, box.x2);
      const bottom = Math.min(box.y1, box.y2);
      const top = Math.max(box.y1, box.y2);
      const withinY = node.y >= bottom - 0.04 && node.y <= top + 0.04;
      const withinX = node.x >= left - 0.04 && node.x <= right + 0.04;
      return (
        (node.placement === "left" && isNear(node.x, left) && withinY) ||
        (node.placement === "right" && isNear(node.x, right) && withinY) ||
        (node.placement === "above" && isNear(node.y, top) && withinX) ||
        (node.placement === "below" && isNear(node.y, bottom) && withinX)
      );
    });
    if (!edgeBox || !node.placement) return { x: node.x, y: node.y, placement: node.placement };
    const offset = 0.22;
    if (node.placement === "left") return { x: node.x - offset, y: node.y, placement: node.placement };
    if (node.placement === "right") return { x: node.x + offset, y: node.y, placement: node.placement };
    if (node.placement === "above") return { x: node.x, y: node.y + offset, placement: node.placement };
    return { x: node.x, y: node.y - offset, placement: node.placement };
  };
  const points = [
    ...diagram.boxes.flatMap((box) => [toPoint(box.x1, box.y1), toPoint(box.x2, box.y2)]),
    ...diagram.nodes.map((node) => {
      const placed = resolvePlacedNode(node);
      return toPoint(placed.x, placed.y);
    }),
    ...diagram.arrows.flatMap((arrow) => [toPoint(arrow.x1, arrow.y1), toPoint(arrow.x2, arrow.y2)]),
    ...diagram.wires.flatMap((wire) => [toPoint(wire.x1, wire.y1), toPoint(wire.x2, wire.y2)]),
  ];
  const minX = Math.min(...points.map((point) => point.x)) - 170;
  const minY = Math.min(...points.map((point) => point.y)) - 70;
  const maxX = Math.max(...points.map((point) => point.x)) + 220;
  const maxY = Math.max(...points.map((point) => point.y)) + 70;
  const width = Math.max(maxX - minX, 420);
  const height = Math.max(maxY - minY, 220);
  const aspectRatio = width / height;
  const renderedHeight = aspectRatio > 3.2 ? 220 : aspectRatio > 1.8 ? 260 : 300;
  const viewBox = `${minX} ${minY} ${width} ${height}`;

  return (
    <svg
      role="img"
      aria-label="Rendered block diagram"
      viewBox={viewBox}
      style={{ height: renderedHeight }}
      className="block w-full bg-white"
    >
      <defs>
        <marker id="block-arrow-end" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#111827" />
        </marker>
        <marker id="block-arrow-start" viewBox="0 0 10 10" refX="2" refY="5" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M 10 0 L 0 5 L 10 10 z" fill="#111827" />
        </marker>
      </defs>
      {diagram.boxes.map((box, index) => {
        const topLeft = toPoint(Math.min(box.x1, box.x2), Math.max(box.y1, box.y2));
        const bottomRight = toPoint(Math.max(box.x1, box.x2), Math.min(box.y1, box.y2));
        return (
          <rect
            key={`box-${index}`}
            x={topLeft.x}
            y={topLeft.y}
            width={bottomRight.x - topLeft.x}
            height={bottomRight.y - topLeft.y}
            rx="12"
            fill="#fff"
            stroke="#111827"
            strokeWidth="4"
          />
        );
      })}
      <g stroke="#111827" strokeLinecap="round" strokeWidth="4">
        {diagram.wires.map((wire, index) => {
          const start = toPoint(wire.x1, wire.y1);
          const end = toPoint(wire.x2, wire.y2);
          const isHorizontal = Math.abs(start.y - end.y) < 2;
          const isRightOutput = isHorizontal && start.x < end.x && start.x > maxX - 420;
          const labelX = isRightOutput ? end.x + 22 : (start.x + end.x) / 2;
          const labelY = isRightOutput ? end.y + 8 : (start.y + end.y) / 2 - 18;
          const textAnchor = isRightOutput ? "start" : "middle";
          return (
            <g key={`wire-${index}`}>
              <path d={`M ${start.x} ${start.y} L ${end.x} ${end.y}`} fill="none" />
              {wire.label ? (
                <text
                  x={labelX}
                  y={labelY}
                  textAnchor={textAnchor}
                  stroke="none"
                  className="fill-slate-900 text-[22px] font-semibold"
                >
                  {wire.label}
                </text>
              ) : null}
            </g>
          );
        })}
        {diagram.arrows.map((arrow, index) => {
          const start = toPoint(arrow.x1, arrow.y1);
          const end = toPoint(arrow.x2, arrow.y2);
          const marker = arrow.direction === "input" ? "url(#block-arrow-start)" : "url(#block-arrow-end)";
          const isHorizontal = Math.abs(start.y - end.y) < 2;
          const labelPlacement =
            arrow.labelPlacement === "left" || arrow.labelPlacement === "right"
              ? arrow.labelPlacement
              : arrow.labelPlacement === "above" && isHorizontal
                ? arrow.direction === "input"
                  ? "left"
                  : "right"
                : arrow.labelPlacement;
          const labelX =
            labelPlacement === "left"
              ? Math.min(start.x, end.x) - 22
              : labelPlacement === "right"
                ? Math.max(start.x, end.x) + 22
                : (start.x + end.x) / 2;
          const labelY =
            labelPlacement === "above"
              ? Math.min(start.y, end.y) - 16
              : labelPlacement === "below"
                ? Math.max(start.y, end.y) + 30
                : (start.y + end.y) / 2 + 8;
          const textAnchor = labelPlacement === "left" ? "end" : labelPlacement === "right" ? "start" : "middle";
          return (
            <g key={`arrow-${index}`}>
              <path
                d={`M ${start.x} ${start.y} L ${end.x} ${end.y}`}
                fill="none"
                markerStart={arrow.direction === "input" ? marker : undefined}
                markerEnd={arrow.direction === "output" ? marker : undefined}
              />
              {arrow.label ? (
                <text
                  x={labelX}
                  y={labelY}
                  textAnchor={textAnchor}
                  stroke="none"
                  className="fill-slate-900 text-[26px] font-semibold"
                >
                  {arrow.label}
                </text>
              ) : null}
            </g>
          );
        })}
      </g>
      {diagram.nodes.map((node, index) => {
        const placed = resolvePlacedNode(node);
        const point = toPoint(placed.x, placed.y);
        const textAnchor = placed.placement === "left" ? "end" : placed.placement === "right" ? "start" : "middle";
        if (node.shape === "circle") {
          return (
            <g key={`node-${index}`}>
              <circle cx={point.x} cy={point.y} r="34" fill="#fff" stroke="#111827" strokeWidth="4" />
              <text x={point.x} y={point.y + 8} textAnchor={textAnchor} className="fill-slate-900 text-[20px] font-bold">
                {node.text}
              </text>
            </g>
          );
        }

        return (
          <text key={`node-${index}`} x={point.x} y={point.y + 9} textAnchor={textAnchor} className="fill-slate-900 text-[28px] font-bold">
            {node.text}
          </text>
        );
      })}
    </svg>
  );
}

function CircuitSvg({ diagram }: { diagram: CircuitDiagram }) {
  const scale = 125;
  const gateMap = new Map(diagram.gates.map((gate) => [gate.id, { ...gate, x: gate.x * scale, y: -gate.y * scale }]));

  const inputPort = (gate: CircuitGate, inputIndex: number) => {
    const yOffset = inputIndex === 1 ? -22 : 22;
    const xOffset = gate.kind === "xor" || gate.kind === "or" || gate.kind === "nor" ? -40 : -42;
    return { x: gate.x + xOffset, y: gate.y + yOffset };
  };

  const outputPort = (gate: CircuitGate) => {
    const xOffset = gate.kind === "nor" ? 66 : gate.kind === "xor" || gate.kind === "or" ? 50 : 48;
    return { x: gate.x + xOffset, y: gate.y };
  };
  const coordMap = new Map(
    diagram.coordRefs.flatMap((coord) => {
      const gate = gateMap.get(coord.gateId);
      if (!gate) return [];
      const start = outputPort(gate);
      return [[coord.id, { x: start.x + coord.dx * scale, y: start.y }]];
    }),
  );

  const points = [
    ...Array.from(gateMap.values()).flatMap((gate) => [
      { x: gate.x - 90, y: gate.y - 60 },
      { x: gate.x + 115, y: gate.y + 60 },
    ]),
    ...diagram.labels.map((label) => ({ x: label.x * scale, y: -label.y * scale })),
    ...diagram.wires.flatMap((wire) => {
      if (wire.type === "output") {
        const gate = gateMap.get(wire.gateId);
        return gate ? [{ x: gate.x + 85 + wire.dx * scale, y: gate.y }] : [];
      }
      if (wire.type === "gate") {
        const fromGate = gateMap.get(wire.fromGateId);
        const toGate = gateMap.get(wire.toGateId);
        if (!fromGate || !toGate) return [];
        return [outputPort(fromGate), inputPort(toGate, wire.inputIndex)];
      }
      if (wire.type === "gateRoute") {
        const fromGate = gateMap.get(wire.fromGateId);
        const toGate = gateMap.get(wire.toGateId);
        if (!fromGate || !toGate) return [];
        const start = outputPort(fromGate);
        const end = inputPort(toGate, wire.inputIndex);
        return [start, { x: start.x + wire.dx * scale, y: start.y }, { x: start.x + wire.dx * scale, y: end.y }, end];
      }
      if (wire.type === "feedback") {
        const from = coordMap.get(wire.coordId);
        const toGate = gateMap.get(wire.gateId);
        if (!from || !toGate) return [];
        const start = { x: from.x + wire.dx * scale, y: from.y };
        const mid = { x: start.x, y: start.y - wire.dy * scale };
        return [from, start, mid, inputPort(toGate, wire.inputIndex)];
      }
      return [{ x: wire.fromX * scale, y: -wire.fromY * scale }];
    }),
  ];
  const labelAllowance = Math.max(
    70,
    ...diagram.labels.map((label) => cleanCircuitLabel(label.text).length * 12 + 26),
    ...diagram.wires.map((wire) => ("label" in wire && wire.label ? cleanCircuitLabel(wire.label).length * 12 + 26 : 0)),
  );
  const minX = Math.min(...points.map((point) => point.x)) - labelAllowance;
  const minY = Math.min(...points.map((point) => point.y)) - 86;
  const maxX = Math.max(...points.map((point) => point.x)) + labelAllowance;
  const maxY = Math.max(...points.map((point) => point.y)) + 70;
  const width = Math.max(maxX - minX, 360);
  const height = Math.max(maxY - minY, 180);
  const aspectRatio = width / height;
  const renderedHeight = aspectRatio > 3.2 ? 220 : aspectRatio > 1.8 ? 260 : 300;
  const viewBox = `${minX} ${minY} ${width} ${height}`;

  return (
    <svg
      role="img"
      aria-label="Rendered circuit diagram"
      viewBox={viewBox}
      style={{ height: renderedHeight }}
      className="block w-full bg-white"
    >
      <g stroke="#111827" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3">
        {diagram.wires.map((wire, index) => {
          if (wire.type === "output") {
            const gate = gateMap.get(wire.gateId);
            if (!gate) return null;
            const start = outputPort(gate);
            const endX = start.x + wire.dx * scale;
            return (
              <g key={`wire-${index}`}>
                <path d={`M ${start.x} ${start.y} L ${endX} ${start.y}`} fill="none" />
                {wire.label ? (
                  <text
                    x={endX + 12}
                    y={start.y + 7}
                    textAnchor="start"
                    stroke="none"
                    className="fill-slate-900 text-[22px] font-semibold"
                  >
                    {wire.label}
                  </text>
                ) : null}
              </g>
            );
          }

          if (wire.type === "gate") {
            const fromGate = gateMap.get(wire.fromGateId);
            const toGate = gateMap.get(wire.toGateId);
            if (!fromGate || !toGate) return null;
            const from = outputPort(fromGate);
            const to = inputPort(toGate, wire.inputIndex);
            return <path key={`wire-${index}`} d={`M ${from.x} ${from.y} L ${to.x} ${to.y}`} fill="none" />;
          }

          if (wire.type === "gateRoute") {
            const fromGate = gateMap.get(wire.fromGateId);
            const toGate = gateMap.get(wire.toGateId);
            if (!fromGate || !toGate) return null;
            const from = outputPort(fromGate);
            const to = inputPort(toGate, wire.inputIndex);
            const midX = from.x + wire.dx * scale;
            return <path key={`wire-${index}`} d={`M ${from.x} ${from.y} L ${midX} ${from.y} L ${midX} ${to.y} L ${to.x} ${to.y}`} fill="none" />;
          }

          if (wire.type === "feedback") {
            const fromRef = coordMap.get(wire.coordId);
            const toGate = gateMap.get(wire.gateId);
            if (!fromRef || !toGate) return null;
            const startX = fromRef.x + wire.dx * scale;
            const startY = fromRef.y;
            const midY = startY - wire.dy * scale;
            const to = inputPort(toGate, wire.inputIndex);
            return (
              <path
                key={`wire-${index}`}
                d={`M ${fromRef.x} ${fromRef.y} L ${startX} ${startY} L ${startX} ${midY} L ${to.x} ${midY} L ${to.x} ${to.y}`}
                fill="none"
              />
            );
          }

          const gate = gateMap.get(wire.gateId);
          if (!gate) return null;
          const from = { x: wire.fromX * scale, y: -wire.fromY * scale };
          const to = inputPort(gate, wire.inputIndex);

          if (wire.type === "coord") {
            return <path key={`wire-${index}`} d={`M ${from.x} ${from.y} L ${to.x} ${to.y}`} fill="none" />;
          }

          if (wire.type === "tap") {
            return (
              <g key={`wire-${index}`}>
                <path d={`M ${from.x} ${from.y} L ${from.x} ${to.y} L ${to.x} ${to.y}`} fill="none" />
                <circle cx={from.x} cy={from.y} r="6" fill="#111827" />
              </g>
            );
          }

          return (
            <g key={`wire-${index}`}>
              <path d={`M ${from.x} ${from.y} L ${to.x} ${to.y}`} fill="none" />
              {wire.label ? (
                <text
                  x={from.x - 14}
                  y={from.y + 7}
                  textAnchor="end"
                  stroke="none"
                  className="fill-slate-900 text-[22px] font-semibold"
                >
                  {wire.label}
                </text>
              ) : null}
            </g>
          );
        })}
      </g>
      {Array.from(gateMap.values()).map((gate) => (
        <GateShape key={gate.id} gate={gate} />
      ))}
    </svg>
  );
}

function TikzDiagram({ source }: { source: string }) {
  const blockDiagram = useMemo(() => parseBlockDiagram(source), [source]);
  const circuitDiagram = useMemo(() => parseGateDiagram(source), [source]);

  return (
    <figure className="my-4 overflow-hidden rounded-lg border border-border bg-bg-primary">
      <div className="border-b border-border px-3 py-2 text-[13px] font-semibold text-text-primary">
        {blockDiagram ? "Block Diagram" : "Circuit Diagram"}
      </div>
      {blockDiagram ? (
        <div className="bg-white px-4 py-3">
          <BlockDiagramSvg diagram={blockDiagram} />
        </div>
      ) : circuitDiagram ? (
        <div className="bg-white px-4 py-3">
          <CircuitSvg diagram={circuitDiagram} />
        </div>
      ) : (
        <div className="border-b border-border bg-bg-secondary px-4 py-5 text-sm leading-6 text-text-secondary">
          This diagram uses a TikZ pattern that the app cannot render yet. The source is available below.
        </div>
      )}
      <details className="border-t border-border bg-bg-secondary/45 px-3 py-2">
        <summary className="cursor-pointer text-[12px] font-medium text-text-muted transition hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong/60">
          View TikZ source
        </summary>
        <pre className="mt-2 max-h-72 overflow-auto rounded-md border border-border bg-bg-tertiary p-3 text-[12px] leading-5">
          <code>{source}</code>
        </pre>
      </details>
    </figure>
  );
}

export const Markdown = React.memo(function Markdown({ text, className = "" }: { text: string; className?: string }) {
  const segments = useMemo(() => splitTikzSegments(text), [text]);

  return (
    <div className={MARKDOWN_CLASS + className}>
      {segments.map((segment, index) =>
        segment.type === "tikz" ? (
          <TikzDiagram key={`${index}-tikz`} source={segment.source} />
        ) : segment.text.trim() ? (
          <div key={`${index}-markdown`} dangerouslySetInnerHTML={{ __html: renderMarkdown(segment.text) }} />
        ) : null,
      )}
    </div>
  );
});
