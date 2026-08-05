type ActivityAdmin = {
  from: (table: string) => {
    insert: (value: Record<string, unknown>) => PromiseLike<{ error?: unknown }>;
  };
};

export async function recordTeacherClassroomActivity(
  admin: ActivityAdmin,
  activity: {
    classroomId: string;
    actorId?: string | null;
    actorKind?: "teacher" | "student" | "system";
    eventType: string;
    summary: string;
    metadata?: Record<string, unknown>;
  },
) {
  try {
    await admin.from("teacher_classroom_activity").insert({
      classroom_id: activity.classroomId,
      actor_id: activity.actorId || null,
      actor_kind: activity.actorKind || "teacher",
      event_type: activity.eventType,
      summary: activity.summary,
      metadata: activity.metadata || {},
    });
  } catch {
    // Activity is useful context, but it must never roll back the classroom action.
  }
}
