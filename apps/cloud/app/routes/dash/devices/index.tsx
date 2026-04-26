import { useMemo, useState } from "react";
import { data, Link } from "react-router";
import { DateTimeDisplay } from "~/components/datetime-display";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Switch } from "~/components/ui/switch";
import { getPageTitle } from "~/lib/utils";
import { requiredAuthContext } from "~/middlewares/auth";
import { type DeviceView, listDevices } from "~/services/devices.server";
import type { Route } from "./+types/index";

export function meta() {
  return [{ title: getPageTitle("Devices") }];
}

export async function loader({ context }: Route.LoaderArgs) {
  const { user } = context.get(requiredAuthContext);
  const devices = await listDevices({ userId: user.id });
  return data({ devices });
}

export default function DevicesIndexRoute({ loaderData: { devices } }: Route.ComponentProps) {
  const [showRevoked, setShowRevoked] = useState(false);

  const visible = useMemo(
    () => (showRevoked ? devices : devices.filter((d) => d.revokedAt === null)),
    [devices, showRevoked],
  );

  const revokedCount = devices.length - devices.filter((d) => d.revokedAt === null).length;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-semibold text-2xl">Devices</h1>
          <p className="text-muted-foreground text-sm">
            Chrome extension installations connected to your account.
          </p>
        </div>
        {revokedCount > 0 ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Switch
              id="show-revoked-toggle"
              checked={showRevoked}
              onCheckedChange={(v) => setShowRevoked(Boolean(v))}
            />
            <label htmlFor="show-revoked-toggle">Show revoked ({revokedCount})</label>
          </div>
        ) : null}
      </header>

      {visible.length === 0 ? (
        <EmptyState
          hasAny={devices.length > 0}
          allRevokedHidden={devices.length > 0 && !showRevoked}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>
              {visible.length} device{visible.length === 1 ? "" : "s"}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            <DeviceTable devices={visible} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function EmptyState({ hasAny, allRevokedHidden }: { hasAny: boolean; allRevokedHidden: boolean }) {
  const message = hasAny
    ? allRevokedHidden
      ? "All your devices are revoked. Toggle 'Show revoked' to view them."
      : "No devices to display."
    : "No devices connected yet. Open the OpenTab extension, go to Settings → Enable Sync.";
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center text-muted-foreground text-sm">
        {message}
      </CardContent>
    </Card>
  );
}

function DeviceTable({ devices }: { devices: DeviceView[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="px-6 py-2 font-medium">Name</th>
            <th className="px-6 py-2 font-medium">Platform</th>
            <th className="px-6 py-2 font-medium">Extension</th>
            <th className="px-6 py-2 font-medium">Last seen</th>
            <th className="px-6 py-2 font-medium">Status</th>
            <th className="px-6 py-2" aria-label="Details" />
          </tr>
        </thead>
        <tbody>
          {devices.map((d) => (
            <tr key={d.id} className="border-b last:border-0 hover:bg-accent/30">
              <td className="px-6 py-3 font-medium">
                <Link to={`/devices/${d.id}`} className="hover:underline">
                  {d.name}
                </Link>
              </td>
              <td className="px-6 py-3 text-muted-foreground">{d.platform ?? "—"}</td>
              <td className="px-6 py-3 text-muted-foreground">
                {d.extensionVersion ? `v${d.extensionVersion}` : "—"}
              </td>
              <td className="px-6 py-3">
                <DateTimeDisplay date={d.lastSeenAt} />
              </td>
              <td className="px-6 py-3">
                {d.revokedAt === null ? (
                  <Badge variant="secondary">Active</Badge>
                ) : (
                  <Badge variant="outline">Revoked</Badge>
                )}
              </td>
              <td className="px-6 py-3 text-right">
                <Link to={`/devices/${d.id}`} className="text-primary text-sm hover:underline">
                  View
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
