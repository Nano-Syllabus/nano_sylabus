import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), sync: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => ({ auth: { getUser: mocks.auth } }) }));
vi.mock("@/lib/data/community-subjects", () => ({ syncCommunitySubjectTopics: mocks.sync }));
import { POST } from "@/app/api/communities/[slug]/subjects/[subjectId]/sync-topics/route";
import { CommunityError } from "@/lib/data/communities";
const context = { params: Promise.resolve({ slug: "henglish", subjectId: "subject-1" }) };
const request = () => new Request("http://localhost/api/communities/henglish/subjects/subject-1/sync-topics", { method: "POST" });

describe("creator topic extraction endpoint", () => {
  beforeEach(() => {
    mocks.auth.mockResolvedValue({ data: { user: { id: "owner" } } });
    mocks.sync.mockResolvedValue({ topics: [{ title: "Grammar" }], topicSyncStatus: "ready" });
  });
  it("uses the verified account and URL subject/community", async () => {
    const response = await POST(request(), context);
    expect(response.status).toBe(200);
    expect(mocks.sync).toHaveBeenCalledExactlyOnceWith("owner", "henglish", "subject-1");
    expect(await response.json()).toMatchObject({ topicSyncStatus: "ready", topics: [{ title: "Grammar" }] });
  });
  it("requires authentication", async () => {
    mocks.auth.mockResolvedValue({ data: { user: null } });
    expect((await POST(request(), context)).status).toBe(401);
    expect(mocks.sync).not.toHaveBeenCalled();
  });
  it.each([403, 404, 409, 422, 502])("preserves a service rejection (%s)", async (status) => {
    mocks.sync.mockRejectedValue(new CommunityError("Extraction cannot continue", status));
    expect((await POST(request(), context)).status).toBe(status);
  });
});
