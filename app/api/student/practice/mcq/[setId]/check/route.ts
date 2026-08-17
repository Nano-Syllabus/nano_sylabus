import { handleMcqSetCheck } from "../../check-set-handler";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ setId: string }> },
) {
  const { setId } = await params;
  return handleMcqSetCheck(setId, await request.json());
}
