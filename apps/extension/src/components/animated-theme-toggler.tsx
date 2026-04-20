import { cn } from "@opentab/ui/lib/utils";
import { Monitor, Moon, Sun } from "lucide-react";
import { type ButtonHTMLAttributes, type MouseEvent, type Ref, useRef } from "react";
import { useTheme } from "@/lib/theme";

const ICON = { system: Monitor, light: Sun, dark: Moon } as const;

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  ref?: Ref<HTMLButtonElement>;
};

export function AnimatedThemeToggler({ ref, className, onClick, ...rest }: Props) {
  const { mode, cycleTheme } = useTheme();
  const internalRef = useRef<HTMLButtonElement>(null);

  const mergedRef = (el: HTMLButtonElement | null) => {
    internalRef.current = el;
    if (typeof ref === "function") {
      ref(el);
    } else if (ref) {
      (ref as { current: HTMLButtonElement | null }).current = el;
    }
  };

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    onClick?.(event);
    void cycleTheme(internalRef.current);
  };

  const Icon = ICON[mode];

  return (
    <button ref={mergedRef} type="button" onClick={handleClick} className={cn(className)} {...rest}>
      <Icon className="size-4" />
    </button>
  );
}
