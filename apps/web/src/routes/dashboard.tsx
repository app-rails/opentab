import { createFileRoute, redirect } from "@tanstack/react-router";
import { authClient } from "../lib/auth-client";

export const Route = createFileRoute("/dashboard")({
  beforeLoad: async () => {
    const session = await authClient.getSession();
    if (!session.data) {
      throw redirect({ to: "/login" });
    }
  },
  component: DashboardPage,
});

function DashboardPage() {
  return (
    <div className="space-y-6">
      <h1 className="font-bold text-2xl">Dashboard</h1>
      <p className="text-muted-foreground">
        Your synced workspaces and collections will appear here.
      </p>
    </div>
  );
}
