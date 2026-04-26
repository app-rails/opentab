import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

interface ExpandCollapseToolbarProps {
  onExpandAll: () => void;
  onCollapseAll: () => void;
  className?: string;
}

/**
 * Pure presentational toolbar with two ghost buttons that delegate
 * expand/collapse-all actions to the parent. No internal state.
 */
export function ExpandCollapseToolbar({
  onExpandAll,
  onCollapseAll,
  className,
}: ExpandCollapseToolbarProps) {
  return (
    <div className={cn("flex items-center gap-1", className)}>
      <Button variant="ghost" size="sm" onClick={onExpandAll}>
        Expand all
      </Button>
      <Button variant="ghost" size="sm" onClick={onCollapseAll}>
        Collapse all
      </Button>
    </div>
  );
}
