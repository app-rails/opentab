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
import { getSettings, saveSettings } from "@/lib/settings";

export function WelcomeDialog() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    getSettings().then((s) => {
      if (!s.welcome_dismissed) setOpen(true);
    });
  }, []);

  const handleDismiss = useCallback(async () => {
    setOpen(false);
    await saveSettings({ welcome_dismissed: true });
  }, []);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleDismiss()}>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
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
