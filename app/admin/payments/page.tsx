import { redirect } from "next/navigation";

export default async function AdminPaymentsPage() {
  redirect("/admin/billing");
}
