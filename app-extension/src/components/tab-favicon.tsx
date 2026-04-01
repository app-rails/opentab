interface TabFaviconProps {
  url?: string;
  size?: "sm" | "md";
}

export function TabFavicon({ url, size = "sm" }: TabFaviconProps) {
  const sizeClass = size === "md" ? "size-8 rounded-md" : "size-4 rounded-sm";

  return url ? (
    <img src={url} alt="" className={`${sizeClass} shrink-0`} />
  ) : (
    <div className={`${sizeClass} shrink-0 bg-muted`} />
  );
}
