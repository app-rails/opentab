import { useState } from "react";
import { cn } from "~/lib/utils";

interface FaviconStackProps {
  urls: string[];
  totalTabs: number;
  className?: string;
}

const MAX_VISIBLE = 5;

/**
 * Renders up to 5 overlapping 16px favicons followed by a `+N` count when
 * `totalTabs > urls.length`. Each img falls back to a muted color block on
 * load error (favicons hosted on third-party sites fail often enough that
 * we always need a fallback).
 */
export function FaviconStack({ urls, totalTabs, className }: FaviconStackProps) {
  const visible = urls.slice(0, MAX_VISIBLE);
  const remaining = totalTabs - urls.length;
  // Keyed by URL (not stack index) so re-renders with a different `urls[]`
  // don't preserve stale failure flags on positions whose URL has shifted.
  const [failed, setFailed] = useState<Map<string, true>>(new Map());

  return (
    <div className={cn("flex items-center", className)}>
      {visible.map((url, i) =>
        failed.has(url) ? (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: stack position is the identity here
            key={i}
            className="-ml-1 size-4 rounded-sm bg-muted ring-1 ring-background first:ml-0"
          />
        ) : (
          <img
            // biome-ignore lint/suspicious/noArrayIndexKey: stack position is the identity here
            key={i}
            src={url}
            alt=""
            className="-ml-1 size-4 rounded-sm ring-1 ring-background first:ml-0"
            referrerPolicy="no-referrer"
            loading="lazy"
            onError={() =>
              setFailed((prev) => {
                if (prev.has(url)) return prev;
                const next = new Map(prev);
                next.set(url, true);
                return next;
              })
            }
          />
        ),
      )}
      {remaining > 0 ? (
        <span className="ml-1.5 text-muted-foreground text-xs">+{remaining}</span>
      ) : null}
    </div>
  );
}
