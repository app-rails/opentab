import { ExternalLink } from "lucide-react";

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

export function AboutPage() {
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
        <h2 className="text-lg font-semibold">About OpenTab</h2>
        <span className="text-xs text-muted-foreground">{version}</span>
      </div>

      {/* Description */}
      <div className="mt-3 flex items-center gap-2">
        <p className="text-sm text-foreground">OpenTab is a tab management tool</p>
        <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
          OpenTab Info
        </span>
      </div>

      {/* Feature bullets */}
      <ul className="mt-4 list-disc pl-5 space-y-1.5 text-sm text-foreground">
        <li>
          The left sidebar shows all workspaces. Click{" "}
          <span className="font-medium">+</span> to create a new space
        </li>
        <li>
          The right side of the workspace shows currently open tabs in the browser.
          You can drag them to the space area to add to favorites
        </li>
      </ul>

      {/* Docs link */}
      <p className="mt-4 text-sm text-foreground">
        For more information, please refer to{" "}
        <a
          href="https://github.com/nicepkg/opentab"
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-500 hover:underline"
        >
          OpenTab Docs
        </a>
      </p>

      {/* Changelog */}
      <div className="mt-6 flex items-center gap-2">
        <span className="text-sm font-semibold">ChangeLog</span>
        <a
          href="https://github.com/nicepkg/opentab/releases"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm text-blue-500 hover:underline"
        >
          <ExternalLink className="size-3" />
          Latest Version Info
        </a>
      </div>

      {/* Contact us */}
      <div className="mt-4 flex items-center gap-2">
        <span className="text-sm">Contact us</span>
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
