import { XIcon } from "lucide-react";
import { BetterAuthIcon } from "~/components/icons";

export function AppLogo() {
  return (
    <div className="flex items-center gap-3">
      <img src="/icon/logo.svg" alt="OpenTab" className="size-6" />
      <XIcon className="size-3 text-muted-foreground" />
      <BetterAuthIcon className="size-5" />
    </div>
  );
}
