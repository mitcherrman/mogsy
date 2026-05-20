/**
 * Returns the URL only if it uses an http(s) scheme. Otherwise returns "#".
 * Use this whenever rendering user-controlled values as anchor hrefs to
 * prevent javascript: / data: URL injection (stored XSS).
 */
export function safeHref(url: string | null | undefined): string {
  if (!url) return "#";
  const trimmed = String(url).trim();
  if (!trimmed) return "#";
  return /^https?:\/\//i.test(trimmed) ? trimmed : "#";
}
