import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { href, Link, redirect, useLoaderData } from "react-router";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { getPageTitle } from "~/lib/utils";
import { enforceRateLimit } from "~/middlewares";
import { requiredAuthContext } from "~/middlewares/auth";
import { createExchange } from "~/services/extension-setup.server";

export function meta() {
  return [{ title: getPageTitle("Connect Extension") }];
}

type LoaderData = {
  nonce: string;
  callbackUrl: string;
  deviceName: string;
  platform: string;
  extensionVersion: string;
  user: {
    id: string;
    email: string;
    name: string | null;
  };
};

/**
 * Cookie-authenticated landing page for the extension setup handoff
 * (spec §4.1). The extension opens this URL with the approval params in
 * the query string; the user either approves (action mints an exchange
 * row and 302s back to callbackUrl with `exchange_code`) or cancels
 * (302s back with `error=access_denied`).
 *
 * The global `authMiddleware` enforces sign-in for the `/connect/*` tree,
 * so the loader can trust `requiredAuthContext`.
 */
export async function loader({ request, context }: LoaderFunctionArgs) {
  const { user } = context.get(requiredAuthContext);
  const url = new URL(request.url);

  const nonce = url.searchParams.get("nonce") ?? "";
  const callbackUrl = url.searchParams.get("callback_url") ?? "";
  const deviceName = url.searchParams.get("device_name") ?? "Unknown device";
  const platform = url.searchParams.get("platform") ?? "chromium";
  const extensionVersion = url.searchParams.get("extension_version") ?? "0.0.0";

  if (!nonce || !callbackUrl) {
    // Minimal validation; the action re-validates via the service. A missing
    // nonce/callback is a malformed link — surface as 400 rather than
    // letting the approve button dead-end.
    throw new Response("missing nonce or callback_url", { status: 400 });
  }

  const data: LoaderData = {
    nonce,
    callbackUrl,
    deviceName,
    platform,
    extensionVersion,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
    },
  };
  return data;
}

export async function action({ request, context }: ActionFunctionArgs) {
  const { user } = context.get(requiredAuthContext);
  await enforceRateLimit({
    kv: context.cloudflare.env.APP_KV,
    scope: user.id,
    endpoint: "connect.extension",
    max: 10,
    windowSec: 60,
  });

  const form = await request.formData();
  const decision = String(form.get("decision") ?? "");
  const nonce = String(form.get("nonce") ?? "");
  const callbackUrl = String(form.get("callback_url") ?? "");
  const deviceName = String(form.get("device_name") ?? "");
  const platform = String(form.get("platform") ?? "");
  const extensionVersion = String(form.get("extension_version") ?? "");

  if (decision === "cancel") {
    // Bounce the caller back with a standard OAuth-style denial so the
    // extension can surface a clean message.
    const cancelUrl = new URL(callbackUrl);
    cancelUrl.searchParams.set("error", "access_denied");
    cancelUrl.searchParams.set("nonce", nonce);
    return redirect(cancelUrl.toString());
  }

  if (decision !== "approve") {
    throw new Response("unknown decision", { status: 400 });
  }

  const { redirectUrl } = await createExchange(
    { userId: user.id },
    { nonce, callbackUrl, deviceName, platform, extensionVersion },
    context.cloudflare.env,
  );
  return redirect(redirectUrl);
}

export default function ConnectExtensionRoute() {
  const data = useLoaderData<typeof loader>();

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6 p-6 sm:p-10">
      <Card>
        <CardHeader>
          <CardTitle>Connect Chrome extension</CardTitle>
          <CardDescription>
            Approve this device to sync your workspaces with {data.user.email}.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="font-medium text-muted-foreground">Device</dt>
            <dd>{data.deviceName}</dd>
            <dt className="font-medium text-muted-foreground">Platform</dt>
            <dd>{data.platform}</dd>
            <dt className="font-medium text-muted-foreground">Extension</dt>
            <dd>v{data.extensionVersion}</dd>
            <dt className="font-medium text-muted-foreground">Account</dt>
            <dd>{data.user.email}</dd>
          </dl>

          <form method="POST" className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <input type="hidden" name="nonce" value={data.nonce} />
            <input type="hidden" name="callback_url" value={data.callbackUrl} />
            <input type="hidden" name="device_name" value={data.deviceName} />
            <input type="hidden" name="platform" value={data.platform} />
            <input type="hidden" name="extension_version" value={data.extensionVersion} />
            <Button type="submit" name="decision" value="cancel" variant="outline">
              Cancel
            </Button>
            <Button type="submit" name="decision" value="approve">
              Approve
            </Button>
          </form>
          <p className="text-muted-foreground text-xs">
            Not you? <Link to={href("/auth/sign-out")}>Sign out</Link> first.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
