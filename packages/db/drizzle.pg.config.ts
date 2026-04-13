import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/pg/schema/index.ts",
  out: "./drizzle/pg",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://localhost:5432/opentab",
  },
});
