function toDataStreamPayload(text) {
  return `0:${JSON.stringify(text)}\ne:{"finishReason":"stop","usage":{"promptTokens":0,"completionTokens":0},"isContinued":false}\n`;
}

function parseAssistantDataStream(text) {
  const line = text
    .split(/\r?\n/)
    .find((item) => item.startsWith("0:"));

  if (!line) return text.trim();

  try {
    const parsed = JSON.parse(line.slice(2));
    return typeof parsed === "string" ? parsed : String(parsed ?? "");
  } catch {
    return text.trim();
  }
}

const payload = toDataStreamPayload("Hello World");
console.log("Payload:", JSON.stringify(payload));
const parsed = parseAssistantDataStream(payload);
console.log("Parsed:", JSON.stringify(parsed));
