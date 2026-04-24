import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { cn } from "~/lib/utils";

type AvatarSize = 16 | 24 | 32 | 40;

interface UserAvatarProps {
  name: string;
  image?: string | null;
  className?: string;
  size?: AvatarSize;
}

// Map size value to Tailwind class name
const getSizeClass = (size: AvatarSize): string => {
  const sizeMap: Record<AvatarSize, string> = {
    16: "size-4",
    24: "size-6",
    32: "size-8",
    40: "size-10",
  };
  return sizeMap[size];
};

// Derive a two-letter initials fallback from a name.
const getInitials = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase() || "?";
};

export function UserAvatar({ name, image, className, size = 24 }: UserAvatarProps) {
  const sizeClass = getSizeClass(size);

  return (
    <Avatar className={cn(sizeClass, className)}>
      <AvatarImage src={image ?? undefined} alt={name} />
      <AvatarFallback className="rounded-lg" delayMs={0}>
        {getInitials(name)}
      </AvatarFallback>
    </Avatar>
  );
}
