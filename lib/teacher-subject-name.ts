export function validSubjectName(value: unknown) {
  if (typeof value !== "string") return "";
  const name = value.trim().replace(/\s+/g, " ");
  if (!name || name.length > 120) return "";
  if (name === "." || name === "..") return "";
  if (/[\\/\u0000-\u001f]/.test(name)) return "";
  return name;
}
