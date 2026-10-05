/** Browser uploads must use the VPS proxy, including when preparation fails. */
export function requireVpsUploadUrl(uploadUrl: string) {
  const origin = "https://storage.invalid";
  let url: URL;
  try {
    url = new URL(uploadUrl, origin);
  } catch {
    throw new Error("The file upload could not be prepared. Please try again.");
  }
  if (
    url.origin !== origin ||
    !url.pathname.startsWith("/vps-storage/signed-upload/") ||
    !/^\d+$/.test(url.searchParams.get("expires") || "") ||
    !/^[a-f0-9]{64}$/.test(url.searchParams.get("signature") || "")
  ) {
    throw new Error("The file upload could not be prepared. Please try again.");
  }
  return `${url.pathname}${url.search}`;
}

/**
 * The storage server explains its refusals in `detail` ("object exceeds the
 * upload limit", "object URL has expired"…). nginx answers with HTML instead, so
 * a missing detail is normal and the status alone has to carry the reason.
 */
async function readDetail(response: Response) {
  try {
    const body = (await response.json()) as { detail?: unknown };
    return typeof body.detail === "string" ? body.detail.slice(0, 200) : "";
  } catch {
    return "";
  }
}

/** Says what went wrong, and what to do about it, for each way an upload can fail. */
export function uploadFailureMessage(status: number, detail = "") {
  const said = detail.toLowerCase();
  if (status === 413 || said.includes("exceeds the upload limit"))
    return "The file is over the upload size limit, so the server refused it.";
  if (said.includes("expired")) return "The upload link expired. Please try again.";
  if (status === 401 || status === 403)
    return "The upload link is no longer valid. Please try again.";
  if (status === 409 || said.includes("already exists"))
    return "This file was already uploaded. Please try again.";
  if (status === 503 || said.includes("not configured"))
    return "File storage isn't set up on the server yet. Please tell an admin.";
  if (status === 502 || status === 504)
    return `The storage server didn't answer (error ${status}). Please try again in a moment.`;
  return `The file could not be uploaded (error ${status}${detail ? `: ${detail}` : ""}). Please try again.`;
}

export async function uploadVpsFile(uploadUrl: string, file: Blob, contentType: string) {
  const target = requireVpsUploadUrl(uploadUrl);
  let response: Response;
  try {
    response = await fetch(target, {
      method: "PUT",
      headers: { "Content-Type": contentType, "x-upsert": "false" },
      body: file,
    });
  } catch {
    throw new Error("The file could not be uploaded. Check your connection and try again.");
  }
  if (!response.ok)
    throw new Error(uploadFailureMessage(response.status, await readDetail(response)));
}
