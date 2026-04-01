import { Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface AddTabInlineProps {
  onAdd: (url: string) => void;
}

export function AddTabInline({ onAdd }: AddTabInlineProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");

  function handleSubmit() {
    const trimmed = url.trim();
    if (!trimmed) return;

    // Prepend https:// if no protocol
    const finalUrl = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

    try {
      new URL(finalUrl);
    } catch {
      setError("Please enter a valid URL");
      return;
    }

    onAdd(finalUrl);
    setUrl("");
    setError("");
    setIsOpen(false);
  }

  if (!isOpen) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-start gap-1 text-xs text-muted-foreground"
        onClick={() => setIsOpen(true)}
      >
        <Plus className="size-3" />
        Add URL
      </Button>
    );
  }

  return (
    <div className="space-y-1 px-1">
      <div className="flex gap-1">
        <Input
          autoFocus
          placeholder="https://example.com"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            if (error) setError("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSubmit();
            if (e.key === "Escape") {
              setUrl("");
              setError("");
              setIsOpen(false);
            }
          }}
          onBlur={() => {
            if (!url.trim()) {
              setError("");
              setIsOpen(false);
            }
          }}
          className={cn("h-7 text-xs", error && "border-destructive")}
        />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
