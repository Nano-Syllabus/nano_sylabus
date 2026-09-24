import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/lib/auth";

export default async function SignupPhonePage() {
  await requireAuthenticatedUser();
  redirect("/app/settings");
}
