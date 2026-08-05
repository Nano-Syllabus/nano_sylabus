"use client";

import { Button } from "@/components/ui/button";

export function PrintInviteButton() {
  return <Button type="button" onClick={() => window.print()}>Print invite</Button>;
}
