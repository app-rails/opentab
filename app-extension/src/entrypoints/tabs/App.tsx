import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function App() {
  return (
    <div className="min-h-screen bg-background p-8">
      <h1 className="text-3xl font-bold mb-8">OpenTab Dashboard</h1>
      <div className="grid grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Workspaces</CardTitle>
            <CardDescription>Switch between contexts</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Coming in M3</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Managed Tabs</CardTitle>
            <CardDescription>Saved tab collections</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Coming in M3</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Live Tabs</CardTitle>
            <CardDescription>Currently open tabs</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Coming in M3</p>
          </CardContent>
        </Card>
      </div>
      <div className="mt-8">
        <Button variant="outline">Tailwind + shadcn/ui working!</Button>
      </div>
    </div>
  );
}
