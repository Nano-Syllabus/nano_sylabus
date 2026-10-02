import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined }) }));
import { SubjectTopicProgress } from "@/components/subject-topic-progress";
import type { CommunitySubjectExplorerInsight } from "@/lib/data/community-subject-explorer";

it("revises every practised topic, starts only the next one on Free, and locks the rest", () => {
  const insight: CommunitySubjectExplorerInsight = {
    subjectId: "s", readiness: 30, materialCount: 1, topicCount: 4, practicedTopicCount: 2, masteredTopicCount: 1, examsTaken: 0, averageScore: 60,
    topics: [80, 60, 0, 0].map((percentage, index) => ({ key: `topic-${index}`, title: `Topic ${index}`, blurb: "", unitNumber: null, percentage, attempts: 0, status: "not_attempted" })),
  };
  const html = renderToStaticMarkup(createElement(SubjectTopicProgress, { insight, courseId: "course", subjectSlug: "math" }));
  expect(html).toContain('/app/notes?courseId=course&amp;subject=math&amp;topic=topic-0');
  // 60% is practised: revise it, never lock it.
  expect(html).toContain('/app/notes?courseId=course&amp;subject=math&amp;topic=topic-1');
  expect(html).toContain('/app/challenges?courseId=course&amp;subject=math&amp;topic=topic-2');
  expect(html.match(/>Revise</g)).toHaveLength(2);
  expect(html.match(/>Start</g)).toHaveLength(1);
  expect(html.match(/>Locked</g)).toHaveLength(1);
});

it("lets Plus and Pro start every unpractised topic", () => {
  const insight: CommunitySubjectExplorerInsight = {
    subjectId: "s", readiness: 30, materialCount: 1, topicCount: 4, practicedTopicCount: 1, masteredTopicCount: 1, examsTaken: 0, averageScore: 60,
    topics: [80, 0, 0, 0].map((percentage, index) => ({ key: `topic-${index}`, title: `Topic ${index}`, blurb: "", unitNumber: null, percentage, attempts: 0, status: "not_attempted" })),
  };
  const html = renderToStaticMarkup(createElement(SubjectTopicProgress, { insight, courseId: "course", subjectSlug: "math", unlockAll: true }));
  expect(html).not.toContain(">Locked<");
  expect(html.match(/>Start</g)).toHaveLength(3);
});
