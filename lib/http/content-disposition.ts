/**
 * A `Content-Disposition` header that survives any file name.
 *
 * Header values must be Latin-1, so a name like macOS's
 * "Screenshot 2026-09-19 at 10.39 AM.png" (a narrow no-break space before
 * "AM") made `new Response` throw "Cannot convert argument to a ByteString".
 * The plain `filename` gets an ASCII stand-in; browsers read the real name
 * from the RFC 5987 `filename*`.
 */
export function contentDisposition(
  type: "inline" | "attachment",
  name: string,
  fallback = "file",
) {
  const clean = name.replace(/[\r\n"\\]/g, "").trim() || fallback;
  const ascii =
    clean
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\x20-\x7e]/g, "_")
      .slice(0, 180) || fallback;
  const encoded = encodeURIComponent(clean).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
