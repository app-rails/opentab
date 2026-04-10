import { Button } from "@opentab/ui/components/button";
import { Input } from "@opentab/ui/components/input";
import { Popover, PopoverContent, PopoverTrigger } from "@opentab/ui/components/popover";
import { Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { normalizeUrl } from "@/lib/url";

interface AddTabPopoverProps {
  onAdd: (url: string, title: string) => void;
}

export function AddTabPopover({ onAdd }: AddTabPopoverProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [urlError, setUrlError] = useState("");

  function reset() {
    setUrl("");
    setTitle("");
    setUrlError("");
  }

  function handleSubmit() {
    const normalized = normalizeUrl(url);
    if (!normalized) {
      setUrlError(t("add_tab.invalid_url"));
      return;
    }
    onAdd(normalized, title.trim());
    reset();
    setOpen(false);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) reset();
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          title={t("add_tab.add_url")}
          aria-label={t("add_tab.add_url")}
        >
          <Plus className="size-3.5 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-3 p-3">
        <div className="space-y-1">
          <label htmlFor="add-tab-url" className="font-medium text-muted-foreground text-xs">
            {t("add_tab.label_url")}
          </label>
          <Input
            id="add-tab-url"
            autoFocus
            placeholder={t("add_tab.placeholder")}
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              if (urlError) setUrlError("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSubmit();
              if (e.key === "Escape") handleOpenChange(false);
            }}
            aria-invalid={!!urlError}
            aria-describedby={urlError ? "add-tab-url-error" : undefined}
            className={urlError ? "h-7 border-destructive text-xs" : "h-7 text-xs"}
          />
          {urlError && (
            <p id="add-tab-url-error" className="text-destructive text-xs">
              {urlError}
            </p>
          )}
        </div>
        <div className="space-y-1">
          <label htmlFor="add-tab-title" className="font-medium text-muted-foreground text-xs">
            {t("add_tab.label_title")}
          </label>
          <Input
            id="add-tab-title"
            placeholder={t("add_tab.title_placeholder")}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSubmit();
              if (e.key === "Escape") handleOpenChange(false);
            }}
            className="h-7 text-xs"
          />
        </div>
        <Button size="xs" className="w-full" onClick={handleSubmit}>
          {t("add_tab.add")}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
