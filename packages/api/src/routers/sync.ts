import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../trpc.js";

// --- Zod payload schemas ---

const workspacePayload = z.object({
  syncId: z.string(),
  name: z.string(),
  icon: z.string().optional(),
  viewMode: z.string().nullable().optional(),
  order: z.string(),
  parentSyncId: z.undefined().optional(),
});

const collectionPayload = z.object({
  syncId: z.string(),
  name: z.string(),
  order: z.string(),
  parentSyncId: z.string(),
});

const tabPayload = z.object({
  syncId: z.string(),
  url: z.string(),
  title: z.string(),
  favIconUrl: z.string().nullable().optional(),
  order: z.string(),
  parentSyncId: z.string(),
});

const deletePayload = z.object({
  syncId: z.string(),
  deletedAt: z.number(),
});

const syncOpSchema = z.discriminatedUnion("entityType", [
  z.object({
    opId: z.string(),
    entityType: z.literal("workspace"),
    entitySyncId: z.string(),
    action: z.literal("create"),
    payload: workspacePayload,
    timestamp: z.number(),
  }),
  z.object({
    opId: z.string(),
    entityType: z.literal("workspace"),
    entitySyncId: z.string(),
    action: z.literal("update"),
    payload: workspacePayload.partial().extend({ syncId: z.string() }),
    timestamp: z.number(),
  }),
  z.object({
    opId: z.string(),
    entityType: z.literal("workspace"),
    entitySyncId: z.string(),
    action: z.literal("delete"),
    payload: deletePayload,
    timestamp: z.number(),
  }),
  z.object({
    opId: z.string(),
    entityType: z.literal("collection"),
    entitySyncId: z.string(),
    action: z.literal("create"),
    payload: collectionPayload,
    timestamp: z.number(),
  }),
  z.object({
    opId: z.string(),
    entityType: z.literal("collection"),
    entitySyncId: z.string(),
    action: z.literal("update"),
    payload: collectionPayload.partial().extend({ syncId: z.string() }),
    timestamp: z.number(),
  }),
  z.object({
    opId: z.string(),
    entityType: z.literal("collection"),
    entitySyncId: z.string(),
    action: z.literal("delete"),
    payload: deletePayload,
    timestamp: z.number(),
  }),
  z.object({
    opId: z.string(),
    entityType: z.literal("tab"),
    entitySyncId: z.string(),
    action: z.literal("create"),
    payload: tabPayload,
    timestamp: z.number(),
  }),
  z.object({
    opId: z.string(),
    entityType: z.literal("tab"),
    entitySyncId: z.string(),
    action: z.literal("update"),
    payload: tabPayload.partial().extend({ syncId: z.string() }),
    timestamp: z.number(),
  }),
  z.object({
    opId: z.string(),
    entityType: z.literal("tab"),
    entitySyncId: z.string(),
    action: z.literal("delete"),
    payload: deletePayload,
    timestamp: z.number(),
  }),
]);

export const syncRouter = router({
  push: protectedProcedure
    .input(
      z.object({
        ops: z.array(syncOpSchema).min(1).max(100),
      }),
    )
    .mutation(({ ctx, input }) => {
      // Validate payload.syncId === entitySyncId for each op
      for (const op of input.ops) {
        if (op.payload.syncId !== op.entitySyncId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Op ${op.opId}: payload.syncId "${op.payload.syncId}" !== entitySyncId "${op.entitySyncId}"`,
          });
        }
      }

      return ctx.syncRepo.pushOps(ctx.user!.id, input.ops);
    }),

  pull: protectedProcedure
    .input(
      z.object({
        cursor: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(500).default(100),
      }),
    )
    .query(({ ctx, input }) => {
      return ctx.syncRepo.pullChanges(ctx.user!.id, input.cursor, input.limit);
    }),

  snapshot: protectedProcedure.query(({ ctx }) => {
    return ctx.syncRepo.getSnapshot(ctx.user!.id);
  }),
});
