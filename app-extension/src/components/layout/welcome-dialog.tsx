import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import opentabLogo from "@/assets/opentab-logo.webp";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MSG } from "@/lib/constants";
import { getSettings, saveSettings } from "@/lib/settings";

export function WelcomeDialog() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let mounted = true;

    const syncOpenState = async () => {
      const s = await getSettings();
      if (mounted) setOpen(!s.welcome_dismissed);
    };

    void syncOpenState();

    const listener = (message: { type: string }) => {
      if (message.type === MSG.SETTINGS_CHANGED) void syncOpenState();
    };
    chrome.runtime.onMessage.addListener(listener);

    return () => {
      mounted = false;
      chrome.runtime.onMessage.removeListener(listener);
    };
  }, []);

  const handleDismiss = useCallback(async () => {
    setOpen(false);
    await saveSettings({ welcome_dismissed: true });
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-md"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader className="items-center">
          <img src={opentabLogo} alt="OpenTab" className="size-16 mb-2" />
          <DialogTitle className="text-xl">{t("welcome.title")}</DialogTitle>
          <DialogDescription className="text-center">
            {t("welcome.newtab_notice")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm text-muted-foreground">
          <p>{t("welcome.feature_organize")}</p>
          <p>{t("welcome.feature_drag")}</p>
        </div>
        <DialogFooter className="sm:justify-center">
          <Button onClick={handleDismiss}>{t("welcome.get_started")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
