import { Button } from "@opentab/ui/components/button";
import { Link } from "@tanstack/react-router";

export function Header() {
  return (
    <header className="border-b">
      <div className="container mx-auto flex items-center justify-between px-4 py-3">
        <Link to="/" className="font-semibold text-lg">
          OpenTab
        </Link>
        <nav className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/login">Sign In</Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}
