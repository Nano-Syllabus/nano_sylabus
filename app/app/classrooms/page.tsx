import { redirect } from "next/navigation";
import { requireOnboardedUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ClassroomsPage() {
  await requireOnboardedUser();
  redirect("/app/courses");
}
