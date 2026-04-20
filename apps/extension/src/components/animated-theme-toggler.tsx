import { Monitor, Moon, Sun } from "lucide-react";
import type { ButtonHTMLAttributes, MouseEvent, Ref } from "react";
import { useTheme } from "@/lib/theme";

const ICON = { system: Monitor, light: Sun, dark: Moon } as const;

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  ref?: Ref<HTMLButtonElement>;
};

export function AnimatedThemeToggler({ ref, className, onClick, ...rest }: Props) {
  const { mode, cycleTheme } = useTheme();
  const Icon = ICON[mode];

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    onClick?.(event);
    void cycleTheme(event.currentTarget);
  };

  return (
    <button ref={ref} type="button" onClick={handleClick} className={className} {...rest}>
      <Icon className="size-4" />
    </button>
  );
}
