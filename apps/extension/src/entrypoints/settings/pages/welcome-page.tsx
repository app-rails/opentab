import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@opentab/ui/components/card";
import { ArrowUpDown, Cloud, Globe, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

// 3 setup CTAs in fixed order: language → import → sync. Order matches the
// onboarding intent (cheapest first, optional cloud last) from spec §0.1.
// Each entry is one Card row; the array keeps the JSX flat and lets us add /
// reorder cards without touching layout markup.
type SetupCard = {
  to: string;
  Icon: LucideIcon;
  titleKey: string;
  titleFallback: string;
  descKey: string;
  descFallback: string;
  ctaKey: string;
  ctaFallback: string;
};

const SETUP_CARDS: readonly SetupCard[] = [
  {
    to: "/general",
    Icon: Globe,
    titleKey: "settings.welcome.card_language_title",
    titleFallback: "设置语言",
    descKey: "settings.welcome.card_language_desc",
    descFallback: "选择界面语言,中文 / English 两种,随时可切换。",
    ctaKey: "settings.welcome.card_language_cta",
    ctaFallback: "前往设置 →",
  },
  {
    to: "/import-export",
    Icon: ArrowUpDown,
    titleKey: "settings.welcome.card_import_title",
    titleFallback: "导入已有数据",
    descKey: "settings.welcome.card_import_desc",
    descFallback: "从 OneTab / Toby / 浏览器书签导入,或恢复 OpenTab 备份。",
    ctaKey: "settings.welcome.card_import_cta",
    ctaFallback: "前往导入 →",
  },
  {
    to: "/server",
    Icon: Cloud,
    titleKey: "settings.welcome.card_sync_title",
    titleFallback: "配置服务器同步",
    descKey: "settings.welcome.card_sync_desc",
    descFallback: "连接到 OpenTab Cloud,在多设备间同步。可选,本地用也完全 OK。",
    ctaKey: "settings.welcome.card_sync_cta",
    ctaFallback: "前往配置 →",
  },
];

export function WelcomePage() {
  const { t } = useTranslation();

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-8 py-10">
      <header className="space-y-2">
        <h1 className="font-semibold text-2xl">
          {t("settings.welcome.title", "欢迎使用 OpenTab")}
        </h1>
        <p className="text-muted-foreground text-sm">
          {t("settings.welcome.subtitle", "让你的浏览器标签井井有条。先花一分钟配置一下:")}
        </p>
      </header>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {SETUP_CARDS.map(
          ({ to, Icon, titleKey, titleFallback, descKey, descFallback, ctaKey, ctaFallback }) => (
            <Card key={to} className="gap-4">
              <CardHeader className="gap-3">
                <Icon className="size-6 text-muted-foreground" aria-hidden="true" />
                <CardTitle>{t(titleKey, titleFallback)}</CardTitle>
                <CardDescription>{t(descKey, descFallback)}</CardDescription>
              </CardHeader>
              <CardContent>
                <Link to={to} className="font-medium text-primary text-sm hover:underline">
                  {t(ctaKey, ctaFallback)}
                </Link>
              </CardContent>
            </Card>
          ),
        )}
      </div>

      <div className="rounded-lg border border-border border-dashed bg-muted/30 px-4 py-3 text-muted-foreground text-sm">
        {t(
          "settings.welcome.hint_jump_to_main",
          "💡 不知道从哪开始?直接去主界面创建第一个 workspace,设置随时回来调。",
        )}
      </div>
    </div>
  );
}
