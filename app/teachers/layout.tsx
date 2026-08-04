import { ReactNode } from "react";

export default function TeachersLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-bg-primary text-text-primary">{children}</div>;
}
