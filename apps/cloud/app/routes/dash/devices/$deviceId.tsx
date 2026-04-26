import { and, desc, eq } from "drizzle-orm";
import { AlertTriangleIcon, ArrowLeftIcon } from "lucide-react";
import { data, Form, Link, redirect } from "react-router";
import { DateTimeDisplay } from "~/components/datetime-display";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "~/components/ui/alert-dialog";
import { Badge } from "~/components/ui/badge";
import { Button, buttonVariants } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { devices, syncChangeLogs } from "~/drizzle/schema";
import { cn, getPageTitle } from "~/lib/utils";
import { requiredAuthContext } from "~/middlewares/auth";
import { db } from "~/services/db.server";
import { revokeDevice } from "~/services/devices.server";
import type { Db } from "~/services/sync-repo.server";
import type { Route } from "./+types/$deviceId";

type DeviceDetailView = {
  id: string;
  userId: string;
  name: string;
  platform: string | null;
  extensionVersion: string | null;
  createdAt: number;
  lastSeenAt: number;
  revokedAt: number | null;
};

type RecentChangeView = {
  seq: number;
  entityType: string;
  action: string;
  createdAt: number;
};

export type DeviceDetailLoaderData = {
  device: DeviceDetailView;
  recentChanges: RecentChangeView[];
};

export function meta({ data }: Route.MetaArgs) {
  return [{ title: getPageTitle(data?.device.name ?? "Device") }];
}

/**
 * Testable loader body. Exposed so unit tests can inject a libsql-backed `db`
 * without wiring the full RR7 request plumbing.
 */
export async function loadDeviceDetail(
  dbInstance: Db,
  userId: string,
  deviceId: string,
): Promise<DeviceDetailLoaderData> {
  const [deviceRows, recentRows] = await dbInstance.batch([
    dbInstance
      .select()
      .from(devices)
      .where(and(eq(devices.userId, userId), eq(devices.id, deviceId)))
      .limit(1),
    dbInstance
      .select()
      .from(syncChangeLogs)
      .where(and(eq(syncChangeLogs.userId, userId), eq(syncChangeLogs.deviceId, deviceId)))
      .orderBy(desc(syncChangeLogs.seq))
      .limit(30),
  ]);

  const deviceRow = (deviceRows as (typeof devices.$inferSelect)[])[0];
  if (!deviceRow) {
    throw new Response(null, { status: 404 });
  }

  const device: DeviceDetailView = {
    id: deviceRow.id,
    userId: deviceRow.userId,
    name: deviceRow.name,
    platform: deviceRow.platform ?? null,
    extensionVersion: deviceRow.extensionVersion ?? null,
    createdAt: deviceRow.createdAt.getTime(),
    lastSeenAt: deviceRow.lastSeenAt.getTime(),
    revokedAt: deviceRow.revokedAt ? deviceRow.revokedAt.getTime() : null,
  };

  const recentChanges: RecentChangeView[] = (
    recentRows as (typeof syncChangeLogs.$inferSelect)[]
  ).map((r) => ({
    seq: r.seq,
    entityType: r.entityType,
    action: r.action,
    createdAt: r.createdAt.getTime(),
  }));

  return { device, recentChanges };
}

export async function loader({ context, params }: Route.LoaderArgs) {
  const { user } = context.get(requiredAuthContext);
  const result = await loadDeviceDetail(db as unknown as Db, user.id, params.deviceId);
  return data(result);
}

export async function action({ context, params, request }: Route.ActionArgs) {
  const { user } = context.get(requiredAuthContext);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  if (intent === "revoke") {
    await revokeDevice({ userId: user.id }, params.deviceId);
    return redirect("/dash/devices");
  }
  throw new Response("unknown intent", { status: 400 });
}

export default function DeviceDetailRoute({
  loaderData: { device, recentChanges },
}: Route.ComponentProps) {
  const revoked = device.revokedAt !== null;

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/dash/devices"
          className="inline-flex items-center gap-1.5 text-muted-foreground text-sm hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" />
          Back to devices
        </Link>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-2xl">{device.name}</CardTitle>
            {revoked ? (
              <Badge variant="outline">Revoked</Badge>
            ) : (
              <Badge variant="secondary">Active</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Platform</dt>
            <dd>{device.platform ?? "—"}</dd>
            <dt className="text-muted-foreground">Extension version</dt>
            <dd>{device.extensionVersion ? `v${device.extensionVersion}` : "—"}</dd>
            <dt className="text-muted-foreground">First seen</dt>
            <dd>
              <DateTimeDisplay date={device.createdAt} />
            </dd>
            <dt className="text-muted-foreground">Last seen</dt>
            <dd>
              <DateTimeDisplay date={device.lastSeenAt} />
            </dd>
            {revoked ? (
              <>
                <dt className="text-muted-foreground">Revoked at</dt>
                <dd>
                  <DateTimeDisplay date={device.revokedAt} />
                </dd>
              </>
            ) : null}
          </dl>

          <div className="pt-2">
            {revoked ? (
              <p className="text-muted-foreground text-sm">
                This device can no longer sync. Re-enable sync from the extension to connect a new
                device.
              </p>
            ) : (
              <RevokeButton />
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
        </CardHeader>
        <CardContent>
          {recentChanges.length === 0 ? (
            <p className="text-muted-foreground text-sm">No sync activity recorded yet.</p>
          ) : (
            <ul className="divide-y">
              {recentChanges.map((c) => (
                <li
                  key={c.seq}
                  className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                >
                  <span>
                    <span className="font-medium">{c.entityType}</span>
                    <span className="mx-2 text-muted-foreground">·</span>
                    <span className="text-muted-foreground">{c.action}</span>
                  </span>
                  <DateTimeDisplay date={c.createdAt} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function RevokeButton() {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive">
          <AlertTriangleIcon className="size-4" />
          Revoke this device
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Revoke this device?</AlertDialogTitle>
          <AlertDialogDescription>
            Revoking immediately stops this device from syncing. The browser will sign out the next
            time it tries to push changes. You can re-enable sync from the extension later.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Form method="POST">
            <input type="hidden" name="intent" value="revoke" />
            <AlertDialogAction
              type="submit"
              className={cn(buttonVariants({ variant: "destructive" }))}
            >
              Revoke device
            </AlertDialogAction>
          </Form>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
