import { ToggleGroup, ToggleGroupItem } from "@opentab/ui/components/toggle-group";
import { Monitor, Moon, Sun } from "lucide-react";
import type { ButtonHTMLAttributes, Ref } from "react";
import { useTranslation } from "react-i18next";
import type { ThemeMode } from "@/lib/settings";
import { useTheme } from "@/lib/theme";
import { AnimatedThemeToggler } from "./animated-theme-toggler";

const THEME_VALUES = ["system", "light", "dark"] as const satisfies readonly ThemeMode[];

function isThemeMode(value: string): value is ThemeMode {
  return (THEME_VALUES as readonly string[]).includes(value);
}

// Omit HTML's button `type` so our discriminator ("icon" | "toggle") doesn't
// collapse to `undefined` via intersection with `"submit" | "reset" | "button"`.
// The underlying <button> in AnimatedThemeToggler hardcodes `type="button"` anyway.
type IconProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> & {
  type?: "icon";
  ref?: Ref<HTMLButtonElement>;
};

type ToggleProps = {
  type: "toggle";
  className?: string;
};

export function ThemeToggler(props: IconProps | ToggleProps) {
  const { mode, setTheme } = useTheme();
  const { t } = useTranslation();

  if (props.type === "toggle") {
    const handleValueChange = (value: string) => {
      if (isThemeMode(value)) {
        void setTheme(value);
      }
    };
    const label = (m: ThemeMode) => t("sidebar.theme_label", { mode: t(`sidebar.theme_${m}`) });
    return (
      <ToggleGroup
        type="single"
        className={props.className}
        value={mode}
        onValueChange={handleValueChange}
        variant="outline"
      >
        <ToggleGroupItem value="light" aria-label={label("light")}>
          <Sun />
        </ToggleGroupItem>
        <ToggleGroupItem value="dark" aria-label={label("dark")}>
          <Moon />
        </ToggleGroupItem>
        <ToggleGroupItem value="system" aria-label={label("system")}>
          <Monitor />
        </ToggleGroupItem>
      </ToggleGroup>
    );
  }

  const { type: _type, ...rest } = props;
  return <AnimatedThemeToggler {...rest} />;
}
