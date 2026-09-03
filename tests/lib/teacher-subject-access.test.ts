import { describe, expect, it } from "vitest";
import { groupSubjectCommunities, subjectAccessLabel } from "@/lib/teacher-subject-access";

describe("effective creator subject access", () => {
  const shared = {
    external_subject_slug: "physics",
    status: "active",
    communities: { slug: "engineering", name: "Engineering", status: "active" },
  };

  it("labels a linked subject for community members even when base library storage is private", () => {
    const communities = groupSubjectCommunities([shared]).get("physics") || [];
    expect(communities).toEqual([{ slug: "engineering", name: "Engineering" }]);
    expect(subjectAccessLabel(communities, "private")).toBe("Community members");
  });

  it("excludes archived communities and removed subject links", () => {
    expect(
      groupSubjectCommunities([
        { ...shared, status: "archived" },
        { ...shared, communities: { ...shared.communities, status: "archived" } },
        { ...shared, communities: null },
      ]).size,
    ).toBe(0);
  });

  it("supports existing subjects reused across communities without duplicate labels", () => {
    const links = groupSubjectCommunities([
      shared,
      shared,
      {
        ...shared,
        communities: [{ slug: "science", name: "Science", status: "active" }],
      },
    ]);
    expect(links.get("physics")).toEqual([
      { slug: "engineering", name: "Engineering" },
      { slug: "science", name: "Science" },
    ]);
  });

  it("does not claim member access for an unattached subject", () => {
    expect(subjectAccessLabel([], "private")).toBe("Not added to a community");
    expect(subjectAccessLabel([], "public")).toBe("Public");
  });
});
