import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  return (
    <div className="flex flex-col items-center gap-6 pt-20">
      <h1 className="text-4xl font-bold">OpenTab</h1>
      <p className="text-muted-foreground">Manage your browser tabs across devices.</p>
    </div>
  );
}
