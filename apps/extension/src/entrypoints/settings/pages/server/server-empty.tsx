import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@opentab/ui/components/card";
import { ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";

/**
 * Sync server panel — first-run state (disabled, never configured).
 *
 * Top: simplified hero card (title + subtitle + non-interactive Switch
 * placeholder). The real Switch wiring lands in T23 along with a shared
 * `<ServerHero>` component; for now we inline the minimum so this branch
 * stands on its own. Bottom: the "B 方案" illustration (two browser-shape
 * divs + a short scenario sentence) per spec brainstorm v3 / mockups v5.1.
 */
export function ServerEmpty() {
  const { t } = useTranslation();

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-8 py-10" data-testid="server-empty">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-6">
          <div className="space-y-1.5">
            <CardTitle>{t("settings.server.title", "服务器同步")}</CardTitle>
            <CardDescription>
              {t("settings.server.empty_subtitle", "把工作区和标签同步到你登录的其他设备。")}
            </CardDescription>
          </div>
          <SwitchPlaceholder />
        </CardHeader>
      </Card>

      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-8">
          <div className="flex items-center gap-4">
            <BrowserShape />
            <div className="flex flex-col items-center gap-1 text-muted-foreground text-xs">
              <span>{t("settings.server.empty_after_seconds", "几秒后")}</span>
              <ArrowRight className="size-4" aria-hidden="true" />
            </div>
            <BrowserShape />
          </div>
          <p className="max-w-md text-center text-muted-foreground text-sm">
            {t(
              "settings.server.empty_caption",
              "在这边新建一个工作区,几秒钟之后,在另一台浏览器上打开 OpenTab 就能看到。",
            )}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// Non-interactive grey pill standing in for the real Switch. T23 swaps it for
// the shadcn Switch wired to enableSync()/disableSync().
function SwitchPlaceholder() {
  return (
    <div
      aria-hidden="true"
      className="h-6 w-11 shrink-0 rounded-full bg-muted"
      data-testid="server-switch-placeholder"
    />
  );
}

// Lightweight browser-window glyph: title bar + content rectangle.
function BrowserShape() {
  return (
    <div className="flex h-20 w-28 flex-col overflow-hidden rounded-md border border-border bg-card shadow-sm">
      <div className="flex h-3 items-center gap-1 border-border border-b bg-muted px-1.5">
        <span className="size-1.5 rounded-full bg-muted-foreground/40" />
        <span className="size-1.5 rounded-full bg-muted-foreground/40" />
        <span className="size-1.5 rounded-full bg-muted-foreground/40" />
      </div>
      <div className="flex-1 bg-background" />
    </div>
  );
}
