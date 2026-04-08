import { ExternalLink } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <title>GitHub</title>
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

export function AboutPage() {
  const { t } = useTranslation();
  const version = (() => {
    try {
      return `v${chrome.runtime.getManifest().version}`;
    } catch {
      return "v0.1.0";
    }
  })();

  return (
    <div className="px-2 pt-2">
      {/* Title */}
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold">{t("about.title")}</h2>
        <span className="text-xs text-muted-foreground">{version}</span>
      </div>

      {/* Description */}
      <div className="mt-3 flex items-center gap-2">
        <p className="text-sm text-foreground">{t("about.description")}</p>
        <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
          {t("about.info_badge")}
        </span>
      </div>

      {/* Feature bullets */}
      <ul className="mt-4 list-disc pl-5 space-y-1.5 text-sm text-foreground">
        <li>
          <Trans
            i18nKey="about.feature_sidebar"
            components={{ strong: <span className="font-medium" /> }}
          />
        </li>
        <li>{t("about.feature_drag")}</li>
      </ul>

      {/* Docs link */}
      <p className="mt-4 text-sm text-foreground">
        {t("about.docs_prefix")}{" "}
        <a
          href="https://github.com/nicepkg/opentab"
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-500 hover:underline"
        >
          {t("about.docs_link")}
        </a>
      </p>

      {/* Changelog */}
      <div className="mt-6 flex items-center gap-2">
        <span className="text-sm font-semibold">{t("about.changelog")}</span>
        <a
          href="https://github.com/nicepkg/opentab/releases"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm text-blue-500 hover:underline"
        >
          <ExternalLink className="size-3" />
          {t("about.latest_version")}
        </a>
      </div>

      {/* Contact us */}
      <div className="mt-4 flex items-center gap-2">
        <span className="text-sm">{t("about.contact")}</span>
        <a
          href="https://github.com/nicepkg/opentab"
          target="_blank"
          rel="noopener noreferrer"
          className="text-foreground hover:text-foreground/80"
        >
          <GithubIcon className="size-5" />
        </a>
      </div>
    </div>
  );
}
