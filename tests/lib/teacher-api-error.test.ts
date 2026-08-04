import { describe, expect, it } from "vitest";
import { formatTeacherApiError } from "@/lib/teacher-app/client";

describe("formatTeacherApiError", () => {
  it("formats a nested API detail object", () => {
    expect(
      formatTeacherApiError(
        { detail: { error: "No indexed material is available." } },
        400,
      ),
    ).toBe("No indexed material is available.");
  });

  it("formats FastAPI validation errors", () => {
    expect(
      formatTeacherApiError(
        {
          detail: [
            { loc: ["body", "query"], msg: "Field required", type: "missing" },
            { loc: ["body", "top_k"], msg: "Must be greater than 0" },
          ],
        },
        422,
      ),
    ).toBe("query: Field required; top_k: Must be greater than 0");
  });

  it("never renders an object as object Object", () => {
    const message = formatTeacherApiError({ unexpected: { code: "bad_request" } }, 400);

    expect(message).toBe('{"unexpected":{"code":"bad_request"}}');
    expect(message).not.toContain("[object Object]");
  });
});
