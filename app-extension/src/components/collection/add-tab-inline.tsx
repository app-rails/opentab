import { Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface AddTabInlineProps {
  onAdd: (url: string) => void;
}

export function AddTabInline({ onAdd }: AddTabInlineProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [url, setUrl] = useState("");

  function handleSubmit() {
    const trimmed = url.trim();
    if (!trimmed) return;

    // Prepend https:// if no protocol
    const finalUrl = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

    try {
      new URL(finalUrl);
    } catch {
      return; // Invalid URL, ignore
    }

    onAdd(finalUrl);
    setUrl("");
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
    <div className="flex gap-1 px-1">
      <Input
        autoFocus
        placeholder="https://example.com"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSubmit();
          if (e.key === "Escape") {
            setUrl("");
            setIsOpen(false);
          }
        }}
        onBlur={() => {
          if (!url.trim()) setIsOpen(false);
        }}
        className="h-7 text-xs"
      />
    </div>
  );
}
