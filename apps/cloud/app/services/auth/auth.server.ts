import { env } from "cloudflare:workers";
import { isDevEnv, workerEnv } from "@opentab/config/env/worker";
import { type BetterAuthOptions, betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import {
  admin as adminPlugin,
  customSession as customSessionPlugin,
  lastLoginMethod as lastLoginMethodPlugin,
  username as usernamePlugin,
} from "better-auth/plugins";
import { getExtensionOrigins } from "~/lib/allowlist-origins";
import { appName, cookiePrefix } from "~/lib/config";
import { db } from "../db.server";
import { ac, admin, editor } from "./permissions";

// `env` from cloudflare:workers stays for raw bindings (APP_KV below);
// schema-validated string bindings come from @opentab/config/env/worker.

// trustedOrigins single source of truth = workerEnv.APP_URL.
// Allowed hosts per stage live in `packages/config/src/env/schemas.ts`
// (PROD_APP_URL + DEV_APP_URL_LIST). Vite strictPort + GitHub OAuth
// callback both pin to localhost:5173 in dev, so this list cannot
// widen to a port wildcard without breaking OAuth.
const trustedOrigins = [workerEnv.APP_URL, ...getExtensionOrigins(workerEnv)];

const options = {
  appName,
  baseURL: workerEnv.APP_URL,
  secret: workerEnv.BETTER_AUTH_SECRET,
  trustedOrigins,

  database: drizzleAdapter(db, {
    provider: "sqlite",
    usePlural: true,
  }),

  advanced: {
    cookiePrefix,
    ipAddress: {
      ipAddressHeaders: ["cf-connecting-ip", "x-forwarded-for", "x-real-ip"],
    },
  },

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url, token }) => {
      if (isDevEnv) {
        console.log("Send email to reset password", { user, url, token });
        return;
      }
      // TODO(mailer): wire Cloudflare Email Service (send_email binding,
      // public beta as of 2026-04). Until then, prod requests fail loud
      // rather than silently locking the user out of password reset.
      throw new Error("Mailer not wired: cannot send reset-password email in prod");
    },
  },

  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url, token }) => {
      if (isDevEnv) {
        console.log("Send email to verify email address", { user, url, token });
        return;
      }
      // TODO(mailer): wire Cloudflare Email Service (send_email binding,
      // public beta as of 2026-04). requireEmailVerification stays on, so
      // throwing here makes the missing mailer block the very first prod
      // signup instead of leaving the account permanently unverified.
      throw new Error("Mailer not wired: cannot send verification email in prod");
    },
  },

  socialProviders: {
    github: {
      clientId: workerEnv.GITHUB_CLIENT_ID,
      clientSecret: workerEnv.GITHUB_CLIENT_SECRET,
    },
  },

  account: {
    accountLinking: {
      enabled: true,
      allowDifferentEmails: true,
      trustedProviders: ["github"],
    },
  },

  secondaryStorage: {
    get: async (key) => await env.APP_KV.get(`auth:${key}`, "json"),
    set: async (key, value) => await env.APP_KV.put(`auth:${key}`, JSON.stringify(value)),
    delete: async (key) => await env.APP_KV.delete(`auth:${key}`),
  },

  rateLimit: {
    enabled: true,
    storage: "secondary-storage",
    window: 60, // time window in seconds
    max: 10, // max requests in the window
  },

  plugins: [
    usernamePlugin({
      minUsernameLength: 3,
      maxUsernameLength: 32,
      displayUsernameValidator: (displayUsername) => {
        // Allow only alphanumeric characters, underscores, and hyphens
        return /^[a-zA-Z0-9_-]+$/.test(displayUsername);
      },
    }),
    adminPlugin({
      // Schema transforms missing → "" (load-bearing, see schemas.test.ts),
      // so empty string means "no admin configured".
      adminUserIds: workerEnv.BETTER_AUTH_ADMIN_USER_ID
        ? [workerEnv.BETTER_AUTH_ADMIN_USER_ID]
        : [],
      ac,
      roles: {
        admin,
        editor,
      },
    }),
    lastLoginMethodPlugin({
      cookieName: `${cookiePrefix}.last_used_login_method`, // Default: "better-auth.last_used_login_method"
    }),
  ],
} satisfies BetterAuthOptions;

// betterAuth() wraps `options` and re-passes it to customSessionPlugin so the
// plugin can infer the session/user shape from the same config. The inner
// `options.plugins` is read for types only — not re-mounted — so there's no
// duplicate-registration risk despite the spread.
export const auth = betterAuth({
  ...options,

  plugins: [
    ...(options.plugins ?? []),
    customSessionPlugin(async ({ user, session }) => {
      return {
        user: {
          id: user.id,
          name: user.name,
          username: user.username,
          displayUsername: user.displayUsername,
          image: user.image,
          email: user.email,
          role: user.role,
        },
        session: {
          userId: session.userId,
          token: session.token,
          ipAddress: session.ipAddress,
          userAgent: session.userAgent,
          expiresAt: session.expiresAt,
        },
      };
    }, options),
  ],
});
