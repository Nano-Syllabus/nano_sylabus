type RecordValue = Record<string, unknown>;

function record(value: unknown): RecordValue {
  return value && typeof value === "object" ? value as RecordValue : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function number(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function gradePercentage(grade: unknown) {
  const value = record(grade);
  const total = number(value.total_marks || value.out_of || value.max_marks);
  if (total <= 0) return null;
  return Math.max(0, Math.min(100, Math.round(number(value.total_score || value.score || value.earned_marks) / total * 100)));
}

export function scoreDistribution(grades: unknown[]) {
  const values = grades.map(gradePercentage).filter((value): value is number => value !== null);
  const bands = [
    { label: "Below 40%", min: 0, max: 39, count: 0 },
    { label: "40–59%", min: 40, max: 59, count: 0 },
    { label: "60–79%", min: 60, max: 79, count: 0 },
    { label: "80–100%", min: 80, max: 100, count: 0 },
  ];
  values.forEach((value) => {
    const band = bands.find((item) => value >= item.min && value <= item.max);
    if (band) band.count += 1;
  });
  return { total: values.length, bands: bands.map((band) => ({ label: band.label, count: band.count })) };
}

export function aheadOfCount(grades: unknown[], selectedGrade: unknown) {
  const selected = gradePercentage(selectedGrade);
  if (selected === null) return null;
  const values = grades.map(gradePercentage).filter((value): value is number => value !== null);
  return { aheadOf: values.filter((value) => value < selected).length, comparedWith: Math.max(0, values.length - 1), percentage: selected };
}

export function gradeTopicEvaluation(grade: unknown) {
  const value = record(grade);
  const evaluation = record(value.evaluation);
  const rawTopics = Array.isArray(evaluation.chapters)
    ? evaluation.chapters
    : Array.isArray(evaluation.chapter_breakdown)
      ? evaluation.chapter_breakdown
      : [];
  const topics = rawTopics.flatMap((item) => {
    const topic = record(item);
    const name = text(topic.chapter || topic.title || topic.name);
    if (!name) return [];
    const earned = number(topic.score || topic.earned_marks);
    const marks = number(topic.marks || topic.total_marks || topic.max_marks);
    const percentage = marks > 0 ? Math.round(earned / marks * 100) : number(topic.percentage);
    return [{
      name,
      earned,
      marks,
      percentage: Math.max(0, Math.min(100, percentage)),
      weightage: number(topic.weightage),
      lostWeightage: number(topic.lost_weightage),
      status: text(topic.status) || "not_attempted",
    }];
  });
  const topicNames = (key: "strong_topics" | "weak_topics") => {
    const source = Array.isArray(evaluation[key]) ? evaluation[key] : Array.isArray(value[key]) ? value[key] : [];
    return source.flatMap((item) => typeof item === "string" ? [item] : text(record(item).chapter || record(item).title || record(item).name) ? [text(record(item).chapter || record(item).title || record(item).name)] : []);
  };
  return { topics, strongTopics: topicNames("strong_topics"), weakTopics: topicNames("weak_topics") };
}
