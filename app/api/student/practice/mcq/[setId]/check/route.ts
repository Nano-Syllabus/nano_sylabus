import { handleMcqSetCheck } from "../../check-set-handler";
import { withUsageCommunity } from "@/lib/usage-community";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

async function handlePOST(
  request: Request,
  { params }: { params: Promise<{ setId: string }> },
) {
  const { setId } = await params;
  return handleMcqSetCheck(setId, await request.json());
}

// Tokens these spend are counted against the student's faculty (lib/usage-community.ts).
export const POST = withUsageCommunity(handlePOST);
