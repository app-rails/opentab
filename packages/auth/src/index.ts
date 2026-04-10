import type { Db } from "@opentab/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { anonymous, bearer } from "better-auth/plugins";

export interface AuthConfig {
  db: Db;
  dbProvider: "sqlite" | "pg";
  secret: string;
  baseURL: string;
  trustedOrigins: string[];
  socialProviders?: {
    google?: { clientId: string; clientSecret: string };
    github?: { clientId: string; clientSecret: string };
  };
  cookies?: {
    sameSite?: "strict" | "lax" | "none";
    secure?: boolean;
  };
}

export function createAuth(config: AuthConfig) {
  return betterAuth({
    database: drizzleAdapter(config.db, { provider: config.dbProvider }),
    basePath: "/api/auth",
    secret: config.secret,
    baseURL: config.baseURL,
    trustedOrigins: config.trustedOrigins,
    emailAndPassword: { enabled: true },
    socialProviders: {
      ...config.socialProviders,
    },
    plugins: [anonymous(), bearer()],
    session: {
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    advanced: {
      defaultCookieAttributes: {
        sameSite: config.cookies?.sameSite ?? "lax",
        secure: config.cookies?.secure ?? true,
        httpOnly: true,
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
