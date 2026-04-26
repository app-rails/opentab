import { index, layout, prefix, type RouteConfig, route } from "@react-router/dev/routes";

export default [
  layout("routes/layout.tsx", [index("routes/index.tsx")]),

  // Public legal pages (Privacy, Terms, Security)
  ...prefix("legal", [
    layout("routes/legal/layout.tsx", [
      route("privacy", "routes/legal/privacy.tsx"),
      route("terms", "routes/legal/terms.tsx"),
      route("security", "routes/legal/security.tsx"),
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

  // Dashboard routes (workspace read-only viewer + Phase-2 Web editing)
  // Devices and Settings are nested here so they share the dash shell
  // (sidebar + DashHeader breadcrumb) instead of bare AuthenticatedShell.
  ...prefix("dash", [
    layout("routes/dash/layout.tsx", [
      index("routes/dash/index.tsx"),
      ...prefix("devices", [
        index("routes/dash/devices/index.tsx"),
        route(":deviceId", "routes/dash/devices/$deviceId.tsx"),
      ]),
      ...prefix("settings", [
        layout("routes/dash/settings/layout.tsx", [
          route("account", "routes/dash/settings/account.tsx"),
          route("appearance", "routes/dash/settings/appearance.tsx"),
          route("sessions", "routes/dash/settings/sessions.tsx"),
          route("password", "routes/dash/settings/password.tsx"),
          route("connections", "routes/dash/settings/connections.tsx"),
        ]),
      ]),
      ...prefix("workspace", [
        index("routes/dash/workspace/index.tsx"),
        route("new", "routes/dash/workspace/new.tsx"),
        route(":workspaceSyncId", "routes/dash/workspace/detail.tsx"),
        route(":workspaceSyncId/edit", "routes/dash/workspace/edit.tsx"),
        route(":workspaceSyncId/delete", "routes/dash/workspace/delete.tsx"),
        route(":workspaceSyncId/collection/new", "routes/dash/collection/new.tsx"),
        route(
          ":workspaceSyncId/collection/:collectionSyncId/edit",
          "routes/dash/collection/edit.tsx",
        ),
        route(
          ":workspaceSyncId/collection/:collectionSyncId/delete",
          "routes/dash/collection/delete.tsx",
        ),
        route(":workspaceSyncId/collection/:collectionSyncId/tab/new", "routes/dash/tab/new.tsx"),
        route(
          ":workspaceSyncId/collection/:collectionSyncId/tab/:tabSyncId/edit",
          "routes/dash/tab/edit.tsx",
        ),
        route(
          ":workspaceSyncId/collection/:collectionSyncId/tab/:tabSyncId/delete",
          "routes/dash/tab/delete.tsx",
        ),
      ]),
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
