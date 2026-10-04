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

export async function uploadVpsFile(uploadUrl: string, file: Blob, contentType: string) {
  const response = await fetch(requireVpsUploadUrl(uploadUrl), {
    method: "PUT",
    headers: { "Content-Type": contentType, "x-upsert": "false" },
    body: file,
  });
  if (!response.ok) throw new Error("The file could not be uploaded. Please try again.");
}
