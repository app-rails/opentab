import type { ClientHint } from "./client-hints";

/**
 * Format a date/time using client hints with format: YYYY/MM/DD HH:mm:ss
 *
 * @param date - Date to format
 * @param hints - Client hints (locale and timezone) or partial hints with timeZone
 * @returns Formatted date string in format: 2025/10/12 12:00:00
 */
export function formatDateTimeWithHints(
  date: Date | string | number | null | undefined,
  hints?: Partial<ClientHint> & { timeZone?: string },
): string {
  if (!date) return "-";

  try {
    const dateObj = date instanceof Date ? date : new Date(date);

    const parts = new Intl.DateTimeFormat(hints?.locale ?? "en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZone: hints?.timeZone ?? "UTC",
    }).formatToParts(dateObj);

    // Helper to extract part value (2-digit option guarantees proper padding)
    const get = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((p) => p.type === type)?.value ?? "00";

    return `${get("year")}/${get("month")}/${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
  } catch {
    return "-";
  }
}

/**
 * Format a timestamp relative to "now" using `Intl.RelativeTimeFormat`.
 *
 * Picks the largest sensible unit by absolute diff:
 *   < 60s   → "second"
 *   < 60m   → "minute"
 *   < 24h   → "hour"
 *   < 30d   → "day"
 *   < 12mo  → "month"
 *   else    → "year"
 *
 * `numeric: "auto"` lets the platform say "yesterday" / "now" / "tomorrow" when
 * appropriate, instead of always emitting numeric phrases. Cloudflare Workers
 * supports the full Intl API, so this works in both Node tests and Workers.
 *
 * @param timestampMs - Target time in milliseconds (epoch).
 * @param locale - BCP 47 locale tag; defaults to "en".
 * @returns Localized relative-time string (e.g. "2 hours ago", "in 3 days").
 */
export function formatRelativeFromNow(timestampMs: number, locale = "en"): string {
  const diffSec = Math.round((timestampMs - Date.now()) / 1000);
  const absSec = Math.abs(diffSec);

  let value: number;
  let unit: Intl.RelativeTimeFormatUnit;

  if (absSec < 60) {
    value = diffSec;
    unit = "second";
  } else if (absSec < 60 * 60) {
    value = Math.round(diffSec / 60);
    unit = "minute";
  } else if (absSec < 60 * 60 * 24) {
    value = Math.round(diffSec / 3600);
    unit = "hour";
  } else if (absSec < 60 * 60 * 24 * 30) {
    value = Math.round(diffSec / 86400);
    unit = "day";
  } else if (absSec < 60 * 60 * 24 * 365) {
    value = Math.round(diffSec / (86400 * 30));
    unit = "month";
  } else {
    value = Math.round(diffSec / (86400 * 365));
    unit = "year";
  }

  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  return rtf.format(value, unit);
}
