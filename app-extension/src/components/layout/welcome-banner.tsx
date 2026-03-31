import { X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { MSG } from "@/lib/constants";
import { getSettings, updateSettings } from "@/lib/settings";

export function WelcomeBanner() {
  const [dismissed, setDismissed] = useState(true); // hidden by default until loaded

  useEffect(() => {
    getSettings().then((s) => setDismissed(s.welcome_dismissed));
  }, []);

  const handleDismiss = useCallback(async () => {
    setDismissed(true);
    await updateSettings({ welcome_dismissed: true });
    chrome.runtime.sendMessage({ type: MSG.SETTINGS_CHANGED }).catch(() => {});
  }, []);

  if (dismissed) return null;

  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-accent/50 p-3">
      <div className="flex-1 space-y-1">
        <p className="text-sm font-medium">Welcome to OpenTab</p>
        <p className="text-xs text-muted-foreground">
          Organize your browser tabs into workspaces and collections. Drag tabs from the right panel
          to get started.
        </p>
      </div>
      <Button variant="ghost" size="icon-xs" onClick={handleDismiss} aria-label="Dismiss">
        <X className="size-3" />
      </Button>
    </div>
  );
}
