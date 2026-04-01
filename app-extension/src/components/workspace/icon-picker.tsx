import { WORKSPACE_ICON_OPTIONS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { WORKSPACE_ICONS } from "@/lib/workspace-icons";

interface IconPickerProps {
  value: string;
  onChange: (icon: string) => void;
}

export function IconPicker({ value, onChange }: IconPickerProps) {
  return (
    <div className="grid grid-cols-6 gap-2">
      {WORKSPACE_ICON_OPTIONS.map((name) => {
        const Icon = WORKSPACE_ICONS[name];
        if (!Icon) return null;
        return (
          <button
            key={name}
            type="button"
            aria-label={name}
            aria-pressed={value === name}
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
