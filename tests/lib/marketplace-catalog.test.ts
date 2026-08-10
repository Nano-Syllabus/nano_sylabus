import { describe, expect, it } from "vitest";
import {
  joinMarketplaceWithSubjects,
  listPublishedSubjectNames,
} from "@/lib/tenant/marketplace-catalog";

const tenantSubjects = [
  {
    name: "Digital Logic",
    slug: "digital-logic",
    namespace: "ramesh-teacher",
    namespace_slug: "ramesh-teacher",
    full_path: "ramesh-teacher/Digital Logic",
    folder_path: "ramesh-teacher/Digital Logic",
    chunk_count: 20,
  },
  {
    name: "Engineering Physics",
    slug: "engineering-physics",
    namespace: "hari-teacher",
    namespace_slug: "hari-teacher",
    full_path: "hari-teacher/Engineering Physics",
    folder_path: "hari-teacher/Engineering Physics",
    chunk_count: 30,
  },
  {
    name: "Configured Only",
    slug: "configured-only",
    namespace: "draft-teacher",
    namespace_slug: "draft-teacher",
    full_path: "draft-teacher/Configured Only",
    folder_path: "draft-teacher/Configured Only",
    chunk_count: 0,
  },
];

const marketplace = {
  default_tenant: "nano-syllabus",
  providers: [
    {
      tenant: "teachers-app",
      tenant_name: "Teachers",
      namespace: "ramesh-teacher",
      provider_name: "Ramesh",
      provider_kind: "teacher",
      is_default_tenant: false,
      chunk_count: 20,
      word_count: 1_000,
      document_count: 1,
      subjects: [
        {
          subject: "Digital Logic",
          chunk_count: 20,
          word_count: 1_000,
          document_count: 1,
          unit_count: 8,
        },
      ],
    },
    {
      tenant: "teachers-app",
      tenant_name: "Teachers",
      namespace: "hari-teacher",
      provider_name: "Hari",
      provider_kind: "teacher",
      is_default_tenant: false,
      chunk_count: 30,
      word_count: 1_500,
      document_count: 2,
      subjects: [
        {
          subject: "Engineering Physics",
          chunk_count: 30,
          word_count: 1_500,
          document_count: 2,
          unit_count: 10,
        },
      ],
    },
  ],
};

describe("published student subject catalog", () => {
  it("excludes configured subjects that have no published indexed course", () => {
    const catalog = joinMarketplaceWithSubjects(marketplace, tenantSubjects);

    expect(catalog.subjects.map((subject) => subject.name)).toEqual([
      "Engineering Physics",
      "Digital Logic",
    ]);
    expect(catalog.subjects.some((subject) => subject.name === "Configured Only")).toBe(false);
  });

  it("keeps profile subjects first without hiding the rest of the catalog", () => {
    const catalog = joinMarketplaceWithSubjects(marketplace, tenantSubjects);

    expect(listPublishedSubjectNames(catalog, ["Digital Logic"])).toEqual([
      "Digital Logic",
      "Engineering Physics",
    ]);
  });
});
