import { index, layout, prefix, type RouteConfig, route } from "@react-router/dev/routes";

export default [
  layout("routes/layout.tsx", [
    index("routes/index.tsx"),

    // User settings routes
    ...prefix("settings", [
      layout("routes/settings/layout.tsx", [
        route("account", "routes/settings/account.tsx"),
        route("appearance", "routes/settings/appearance.tsx"),
        route("sessions", "routes/settings/sessions.tsx"),
        route("password", "routes/settings/password.tsx"),
        route("connections", "routes/settings/connections.tsx"),
      ]),
    ]),
  ]),

  // Better Auth routes
  ...prefix("auth", [
    route("sign-in", "routes/auth/sign-in.tsx"),
    route("sign-up", "routes/auth/sign-up.tsx"),
    route("sign-out", "routes/auth/sign-out.tsx"),
    route("forget-password", "routes/auth/forget-password.tsx"),
    route("reset-password", "routes/auth/reset-password.tsx"),
  ]),

  // Devices routes (per-user device management)
  ...prefix("devices", [
    layout("routes/devices/layout.tsx", [
      index("routes/devices/index.tsx"),
      route(":deviceId", "routes/devices/$deviceId.tsx"),
    ]),
  ]),

  // Dashboard routes (workspace read-only viewer + Phase-2 Web editing)
  ...prefix("dash", [
    layout("routes/dash/layout.tsx", [
      index("routes/dash/index.tsx"),
      route("workspaces/new", "routes/dash/workspaces.new.tsx"),
      route(":workspaceSyncId", "routes/dash/$workspaceSyncId.tsx"),
      route(":workspaceSyncId/edit", "routes/dash/$workspaceSyncId.edit.tsx"),
      route(":workspaceSyncId/delete", "routes/dash/$workspaceSyncId.delete.tsx"),
      route(":workspaceSyncId/collections/new", "routes/dash/$workspaceSyncId.collections.new.tsx"),
      route(
        ":workspaceSyncId/collections/:collectionSyncId/edit",
        "routes/dash/$workspaceSyncId.collections.$collectionSyncId.edit.tsx",
      ),
      route(
        ":workspaceSyncId/collections/:collectionSyncId/delete",
        "routes/dash/$workspaceSyncId.collections.$collectionSyncId.delete.tsx",
      ),
      route(
        "collections/:collectionSyncId/tabs/new",
        "routes/dash/collections.$collectionSyncId.tabs.new.tsx",
      ),
      route(
        "collections/:collectionSyncId/tabs/:tabSyncId/edit",
        "routes/dash/collections.$collectionSyncId.tabs.$tabSyncId.edit.tsx",
      ),
      route(
        "collections/:collectionSyncId/tabs/:tabSyncId/delete",
        "routes/dash/collections.$collectionSyncId.tabs.$tabSyncId.delete.tsx",
      ),
    ]),
  ]),

  // Admin routes
  ...prefix("admin", [
    layout("routes/admin/layout.tsx", [
      index("routes/admin/dashboard.tsx"),
      route("users", "routes/admin/users/index.tsx"),
    ]),
  ]),

  // Better Auth and other API routes
  ...prefix("api", [
    route("auth/error", "routes/api/better-error.tsx"),
    route("auth/*", "routes/api/better.tsx"),
    route("theme-switcher", "routes/api/theme-switcher.ts"),
    route("health", "routes/api/health.ts"),

    // Sync endpoints (spec §2.3)
    route("sync/push", "routes/api/sync/push.ts"),
    route("sync/pull", "routes/api/sync/pull.ts"),
    route("sync/snapshot", "routes/api/sync/snapshot.ts"),

    // Extension setup exchange (spec §4.1)
    route("extension/exchange/consume", "routes/api/extension/exchange/consume.ts"),
  ]),

  // Extension connect / approve UI (cookie-authenticated)
  ...prefix("connect", [route("extension", "routes/connect/extension.tsx")]),

  // Not found
  route("*", "routes/not-found.tsx"),
] satisfies RouteConfig;
