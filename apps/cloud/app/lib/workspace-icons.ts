import type { LucideIcon } from "lucide-react";
import {
  Book,
  Briefcase,
  Camera,
  Clapperboard,
  Code,
  Coffee,
  Dumbbell,
  FlaskConical,
  Folder,
  Gamepad2,
  Globe,
  GraduationCap,
  Heart,
  Home,
  Music,
  Newspaper,
  Palette,
  Plane,
  Search,
  ShoppingCart,
  Star,
  Utensils,
  Wallet,
  Zap,
} from "lucide-react";

/**
 * Mirrors `apps/extension/src/lib/workspace-icons.ts`. Workspace icons are
 * persisted as kebab-case lucide names (e.g. "folder", "shopping-cart") so
 * the extension and the cloud render identical glyphs.
 *
 * Keep in lockstep with the extension when adding entries.
 */
export const WORKSPACE_ICONS: Record<string, LucideIcon> = {
  folder: Folder,
  briefcase: Briefcase,
  home: Home,
  code: Code,
  "shopping-cart": ShoppingCart,
  search: Search,
  book: Book,
  music: Music,
  camera: Camera,
  heart: Heart,
  star: Star,
  globe: Globe,
  zap: Zap,
  coffee: Coffee,
  "gamepad-2": Gamepad2,
  "graduation-cap": GraduationCap,
  plane: Plane,
  palette: Palette,
  "flask-conical": FlaskConical,
  newspaper: Newspaper,
  wallet: Wallet,
  dumbbell: Dumbbell,
  utensils: Utensils,
  clapperboard: Clapperboard,
};

export const DEFAULT_WORKSPACE_ICON_COMPONENT: LucideIcon = Folder;
