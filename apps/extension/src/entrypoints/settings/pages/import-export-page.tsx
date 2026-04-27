import { Button } from "@opentab/ui/components/button";
import { Download, Upload } from "lucide-react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { exportAllData } from "@/lib/export";
import { processImportFile } from "@/lib/import/process-file";

export function ImportExportPage() {
  const { t } = useTranslation();
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    try {
      await exportAllData();
    } catch (err) {
      console.error("Export failed:", err);
    } finally {
      setIsExporting(false);
    }
  }, []);

  const handleImport = useCallback(async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        await processImportFile(file, t);
      } catch (err) {
        console.error("Failed to read import file:", err);
        alert(t("settings.import.read_error"));
      }
    };
    input.click();
  }, [t]);

  return (
    <div className="p-8">
      <h2 className="mb-6 font-semibold text-xl">{t("settings.nav.import_export")}</h2>
      <section className="max-w-md space-y-6">
        <h3 className="font-medium text-muted-foreground text-sm uppercase tracking-wide">
          {t("settings.export.title")}
        </h3>
        <p className="text-muted-foreground text-sm">{t("settings.export.description")}</p>
        <Button onClick={handleExport} disabled={isExporting} className="gap-2">
          <Upload className="size-4" />
          {isExporting ? t("settings.export.exporting") : t("settings.export.button")}
        </Button>

        <h3 className="font-medium text-muted-foreground text-sm uppercase tracking-wide">
          {t("settings.import.title")}
        </h3>
        <p className="text-muted-foreground text-sm">{t("settings.import.description")}</p>
        <Button variant="outline" onClick={handleImport} className="gap-2">
          <Download className="size-4" />
          {t("settings.import.button")}
        </Button>
      </section>
    </div>
  );
}
