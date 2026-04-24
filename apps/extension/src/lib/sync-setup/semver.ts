/**
 * Minimal dotted-number version comparator (spec §2.4.5).
 *
 * Accepts `"1.2.3"`-style versions. Anything non-numeric in a position coerces
 * to 0 via `parseInt(..., 10)`. We intentionally do NOT pull in `semver` or
 * `compare-versions` — the protocol contract only promises dotted numeric
 * versions, so the full SemVer surface is unneeded.
 */
export function compareDotted(a: string, b: string): -1 | 0 | 1 {
  const as = a.split(".").map((n) => Number.parseInt(n, 10));
  const bs = b.split(".").map((n) => Number.parseInt(n, 10));
  const len = Math.max(as.length, bs.length);
  for (let i = 0; i < len; i++) {
    const ai = Number.isFinite(as[i]) ? as[i] : 0;
    const bi = Number.isFinite(bs[i]) ? bs[i] : 0;
    if (ai < bi) return -1;
    if (ai > bi) return 1;
  }
  return 0;
}
