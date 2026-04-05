/**
 * Prepend https:// if no protocol is present, then validate.
 * Returns the normalized URL or null if invalid.
 */
export function normalizeUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    new URL(withProtocol);
    return withProtocol;
  } catch {
    return null;
  }
}

/**
 * Derive a favicon URL from a page URL using Google's favicon service.
 */
export function faviconUrl(pageUrl: string): string | undefined {
  try {
    const domain = new URL(pageUrl).hostname;
    return domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=32` : undefined;
  } catch {
    return undefined;
  }
}
