import { betterAuth } from "better-auth";
import { anonymous, bearer } from "better-auth/plugins";
import Database from "better-sqlite3";
import { env } from "./env.js";

export const auth = betterAuth({
  database: new Database("./data/auth.db"),
  basePath: "/api/auth",
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  trustedOrigins: env.TRUSTED_ORIGINS,
  plugins: [anonymous(), bearer()],
});
