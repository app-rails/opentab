import { FolderIcon, LayersIcon, RefreshCwIcon } from "lucide-react";

/**
 * Three-column feature highlight section. Renders the headline pillars from
 * spec §3.6 (Workspaces / Cross-device sync / Collections) as a responsive
 * grid: three columns on `md` and up, single-column stack below.
 *
 * The `id="features"` anchor matches the `href="#features"` link in
 * `LandingHeader` so the nav can scroll-jump to this section.
 */

// TODO: copy finalize
const FEATURES = [
  {
    icon: LayersIcon,
    title: "Workspaces",
    body: "Group tabs by project, topic, or mood.",
  },
  {
    icon: RefreshCwIcon,
    title: "Cross-device sync",
    body: "Local-first, encrypted, opt-in.",
  },
  {
    icon: FolderIcon,
    title: "Collections",
    body: "Save, label, drag, search.",
  },
];

export function Features() {
  return (
    <section id="features" className="border-t bg-background">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-4 py-16 sm:px-6 md:grid-cols-3">
        {FEATURES.map((feature) => (
          <div key={feature.title} data-testid="feature-card" className="flex flex-col items-start">
            <feature.icon className="size-6 text-primary" aria-hidden />
            <h3 className="mt-3 font-semibold text-lg">{feature.title}</h3>
            <p className="mt-1 text-muted-foreground text-sm">{feature.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
