export function TeacherDashboard({ teacherHandle }: { teacherHandle: string }) {
  return (
    <iframe
      key={teacherHandle}
      title="NanoSyllabus Teachers Portal"
      src="/nanoenjoy-teacher.html#/teachers"
      className="block h-screen w-full border-0 bg-bg-primary"
    />
  );
}
