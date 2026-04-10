interface TabFaviconProps {
  url?: string;
  size?: "sm" | "compact" | "md";
}

const sizeClasses: Record<NonNullable<TabFaviconProps["size"]>, string> = {
  sm: "size-4 rounded-sm",
  compact: "size-[22px] rounded-[5px]",
  md: "size-8 rounded-md",
};

export function TabFavicon({ url, size = "sm" }: TabFaviconProps) {
  const cls = sizeClasses[size];

  return url ? (
    <img src={url} alt="" className={`${cls} shrink-0`} />
  ) : (
    <div className={`${cls} shrink-0 bg-muted`} />
  );
}
