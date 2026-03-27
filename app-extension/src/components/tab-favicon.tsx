interface TabFaviconProps {
  url?: string;
}

export function TabFavicon({ url }: TabFaviconProps) {
  return url ? (
    <img src={url} alt="" className="size-4 shrink-0 rounded-sm" />
  ) : (
    <div className="size-4 shrink-0 rounded-sm bg-muted" />
  );
}
