import { Button } from "@opentab/ui/components/button";
import { Popover, PopoverContent, PopoverTrigger } from "@opentab/ui/components/popover";
import { cn } from "@opentab/ui/lib/utils";
import { ArrowUpDown } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { SortDirection, SortKey } from "@/lib/collection-sort";

interface CollectionSortMenuProps {
  disabled?: boolean;
  onApply: (key: Exclude<SortKey, "reverse">, direction: SortDirection) => void;
  onReverse: () => void;
}

export function CollectionSortMenu({ disabled, onApply, onReverse }: CollectionSortMenuProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState<Exclude<SortKey, "reverse">>("title");
  const [direction, setDirection] = useState<SortDirection>("asc");

  const handleOpenChange = (next: boolean) => {
    if (next) {
      setKey("title");
      setDirection("asc");
    }
    setOpen(next);
  };

  const handleApply = () => {
    setOpen(false);
    onApply(key, direction);
  };

  const handleReverse = () => {
    setOpen(false);
    onReverse();
  };

  const keys: Array<{ value: Exclude<SortKey, "reverse">; label: string }> = [
    { value: "title", label: t("collection_card.sort_by_title") },
    { value: "domain", label: t("collection_card.sort_by_domain") },
    { value: "dateAdded", label: t("collection_card.sort_by_date_added") },
  ];

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          disabled={disabled}
          title={disabled ? t("collection_card.sort_disabled") : t("collection_card.sort")}
          aria-label={t("collection_card.sort")}
        >
          <ArrowUpDown className="size-3.5 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-2">
        <div className="px-2 pt-1 pb-2 font-medium text-muted-foreground text-xs">
          {t("collection_card.sort_by_label")}
        </div>
        <div className="flex flex-col gap-0.5" role="radiogroup">
          {keys.map((k) => {
            const selected = key === k.value;
            return (
              <label
                key={k.value}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent",
                  selected && "bg-accent",
                )}
              >
                <input
                  type="radio"
                  name="sort-key"
                  value={k.value}
                  checked={selected}
                  onChange={() => setKey(k.value)}
                  className="sr-only"
                />
                <span
                  className={cn(
                    "inline-flex size-3 items-center justify-center rounded-full border",
                    selected ? "border-primary" : "border-muted-foreground/50",
                  )}
                  aria-hidden="true"
                >
                  {selected && <span className="size-1.5 rounded-full bg-primary" />}
                </span>
                {k.label}
              </label>
            );
          })}
        </div>
        <div className="mt-2 flex items-center gap-2 border-t pt-2">
          <span className="px-2 text-muted-foreground text-xs uppercase tracking-wider">
            {t("collection_card.sort_order_label")}
          </span>
          <div className="ml-auto inline-flex rounded bg-muted p-0.5">
            {(["asc", "desc"] as const).map((d) => (
              <button
                key={d}
                type="button"
                className={cn(
                  "rounded px-2 py-0.5 text-xs",
                  direction === d ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                )}
                onClick={() => setDirection(d)}
                aria-pressed={direction === d}
              >
                {t(`collection_card.sort_order_${d}`)}
              </button>
            ))}
          </div>
        </div>
        <Button size="sm" className="mt-2 w-full" onClick={handleApply}>
          {t("collection_card.sort_apply")}
        </Button>
        <div className="my-2 border-t" />
        <button
          type="button"
          onClick={handleReverse}
          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
        >
          {t("collection_card.sort_reverse")}
        </button>
      </PopoverContent>
    </Popover>
  );
}
