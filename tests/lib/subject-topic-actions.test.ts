import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { SubjectTopicProgress } from "@/components/subject-topic-progress";
import type { CommunitySubjectExplorerInsight } from "@/lib/data/community-subject-explorer";

it("links green topics to revision, starts only the first red topic, and locks the rest", () => {
  const insight: CommunitySubjectExplorerInsight = {
    subjectId: "s", readiness: 30, materialCount: 1, topicCount: 4, practicedTopicCount: 2, masteredTopicCount: 1, examsTaken: 0, averageScore: 60,
    topics: [80, 60, 0, 0].map((percentage, index) => ({ key: `topic-${index}`, title: `Topic ${index}`, blurb: "", unitNumber: null, percentage, attempts: 0, status: "not_attempted" })),
  };
  const html = renderToStaticMarkup(createElement(SubjectTopicProgress, { insight, courseId: "course", subjectSlug: "math" }));
  expect(html).toContain('/app/notes?courseId=course&amp;subject=math&amp;topic=topic-0');
  expect(html).toContain('/app/challenges?courseId=course&amp;subject=math&amp;topic=topic-2');
  expect(html.match(/>Locked</g)).toHaveLength(2);
  expect(html.match(/>Start</g)).toHaveLength(1);
});
