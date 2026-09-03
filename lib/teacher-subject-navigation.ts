/** Keep creator subject navigation in the selected community and semester. */
export function teacherSubjectsHref(
  options: {
    community?: string;
    term?: string;
    communitySubject?: string;
    subject?: string;
    library?: boolean;
    create?: boolean;
  } = {},
) {
  const params = new URLSearchParams({ view: "subjects" });
  if (options.community) params.set("community", options.community);
  if (options.term) params.set("term", options.term);
  if (options.communitySubject) params.set("communitySubject", options.communitySubject);
  if (options.subject) {
    params.set("subject", options.subject);
    params.set("tab", "syllabus");
  }
  if (options.library) params.set("library", "1");
  if (options.create && options.community && options.term) {
    params.set("newSubject", "1");
    params.set("attachCommunity", options.community);
    params.set("attachTerm", options.term);
  }
  return `/teachers?${params.toString()}`;
}

export function teacherSemesterYear(
  terms: ReadonlyArray<{ id: string; yearNumber: number }>,
  termId: string,
) {
  return terms.find((term) => term.id === termId)?.yearNumber ?? terms[0]?.yearNumber ?? 1;
}

export function teacherCommunitySubjectHref(baseHref: string, subject: string, term: string) {
  const [path, query = ""] = baseHref.split("?");
  const params = new URLSearchParams(query);
  params.set("view", "subjects");
  params.delete("communitySubject");
  params.set("subject", subject);
  params.set("tab", "syllabus");
  params.set("term", term);
  return `${path}?${params.toString()}`;
}

/** Resolve old intermediate-workspace bookmarks without depending on topic/forum data. */
export function teacherLegacySubjectHref(
  community: {
    slug: string;
    terms: ReadonlyArray<{
      id: string;
      subjects: ReadonlyArray<{ slug: string; externalSubjectSlug: string | null }>;
    }>;
  },
  communitySubject: string,
  termId: string,
) {
  const term = community.terms.find(
    (item) =>
      (!termId || item.id === termId) &&
      item.subjects.some((subject) => subject.slug === communitySubject),
  );
  const subject = term?.subjects.find((item) => item.slug === communitySubject);
  return term && subject?.externalSubjectSlug
    ? teacherSubjectsHref({
        community: community.slug,
        term: term.id,
        subject: subject.externalSubjectSlug,
      })
    : null;
}
