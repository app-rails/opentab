import { icons } from "lucide-react";
import { WORKSPACE_ICON_OPTIONS } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface IconPickerProps {
  value: string;
  onChange: (icon: string) => void;
}

export function IconPicker({ value, onChange }: IconPickerProps) {
  return (
    <div className="grid grid-cols-6 gap-2">
      {WORKSPACE_ICON_OPTIONS.map((name) => {
        const Icon = icons[toPascalCase(name) as keyof typeof icons];
        if (!Icon) return null;
        return (
          <button
            key={name}
            type="button"
            onClick={() => onChange(name)}
            className={cn(
              "flex size-8 items-center justify-center rounded-md transition-colors",
              value === name
                ? "bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2 ring-offset-background"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            <Icon className="size-4" />
          </button>
        );
      })}
    </div>
  );
}

function toPascalCase(str: string): string {
  return str
    .split("-")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join("");
}
