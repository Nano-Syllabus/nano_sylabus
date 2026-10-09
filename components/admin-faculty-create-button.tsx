"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { AdminFacultyCreate } from "@/components/admin-faculty-create";
import { toast } from "@/components/admin/admin-toaster";

/** "Create faculty" on the Faculties page: the same form the exam setup uses, in a dialog. */
export function AdminFacultyCreateButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700"
      >
        <Plus size={16} aria-hidden="true" />
        Create faculty
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Create faculty"
          onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}
        >
          <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-card p-2 shadow-xl">
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="absolute right-4 top-4 grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted"
            >
              <X size={16} />
            </button>
            <AdminFacultyCreate
              onCancel={() => setOpen(false)}
              onCreated={(faculty) => {
                setOpen(false);
                toast.success(`${faculty.name} created`, {
                  description:
                    faculty.visibility === "public"
                      ? "Link it to a website under Websites to put it in front of students."
                      : "It isn’t public yet, so no website can list it.",
                  action: { label: "Open faculty", href: `/admin/faculties/${encodeURIComponent(faculty.slug)}` },
                });
                router.refresh();
              }}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
