import { generateKeyBetween } from "fractional-indexing";
import { getAuthState } from "./auth-storage";
import { DEFAULT_ICON } from "./constants";
import { db } from "./db";

export async function seedDefaultData(): Promise<void> {
  const authState = await getAuthState();
  const accountId =
    authState?.mode === "online"
      ? authState.accountId
      : authState?.mode === "offline"
        ? authState.localUuid
        : "unknown";

  const existingCount = await db.workspaces.where("accountId").equals(accountId).count();

  if (existingCount > 0) {
    console.log("[db] default data already exists, skipping seed");
    return;
  }

  const now = Date.now();
  const firstOrder = generateKeyBetween(null, null);

  await db.transaction("rw", [db.accounts, db.workspaces], async () => {
    await db.accounts.add({
      accountId,
      mode: authState?.mode ?? "offline",
      createdAt: now,
    });

    await db.workspaces.add({
      accountId,
      name: "Default",
      icon: DEFAULT_ICON,
      isDefault: true,
      order: firstOrder,
      createdAt: now,
    });
  });

  console.log("[db] default workspace created for account:", accountId);
}
