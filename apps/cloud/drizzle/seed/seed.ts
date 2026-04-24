import { hashPassword } from "better-auth/crypto";
import { drizzle } from "drizzle-orm/libsql";
import { d1Url } from "../../drizzle.config";
import { accounts, users } from "../schema/auth";

const db = drizzle(`file:${d1Url}`);

const ADMIN_USER_ID = "F9CgW4v5USKvUNTIGBiafa6xrgDjaOhS";
const ADMIN_ACCOUNT_ID = "W8Oa8UCI6sKswFaF8uzIKkmRfP3HRIaD";
const ADMIN_EMAIL = "admin@example.com";
const ADMIN_PASSWORD = "admin@8899";

async function main() {
  console.log("🌱 Starting to seed data into database...");

  console.log("⌛️ Seeding admin user...");
  const now = new Date();
  const passwordHash = await hashPassword(ADMIN_PASSWORD);

  await db.insert(users).values({
    id: ADMIN_USER_ID,
    name: "Admin",
    email: ADMIN_EMAIL,
    emailVerified: true,
    role: "admin",
    createdAt: now,
    updatedAt: now,
  });

  await db.insert(accounts).values({
    id: ADMIN_ACCOUNT_ID,
    accountId: ADMIN_USER_ID,
    providerId: "credential",
    userId: ADMIN_USER_ID,
    password: passwordHash,
    createdAt: now,
    updatedAt: now,
  });

  console.log("✅ Seeded data successfully!");
  console.log("Admin user id:", ADMIN_USER_ID);
}

main().catch((error: unknown) => {
  const message = `❌ Failed to seed data: ${error instanceof Error ? error.message : error}`;
  console.error(message);
  process.exit(1);
});
