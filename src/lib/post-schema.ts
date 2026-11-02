import { z } from "zod";

/** Validates PlatformOptions (see src/lib/platforms.ts) coming from the composer. */
export const optionsSchema = z
  .object({
    aspect: z.enum(["1:1", "4:5", "9:16", "16:9", "1.91:1", "original"]).optional(),
    focalX: z.number().min(0).max(100).optional(),
    focalY: z.number().min(0).max(100).optional(),
    title: z.string().max(200).optional(),
    privacy: z.enum(["PUBLIC", "FRIENDS", "PRIVATE"]).optional(),
    allowComments: z.boolean().optional(),
    allowDuet: z.boolean().optional(),
    visibility: z.enum(["PUBLIC", "CONNECTIONS"]).optional(),
    firstComment: z.string().max(2200).optional(),
    igFormat: z.enum(["FEED", "REEL"]).optional(),
    mediaIds: z.array(z.string()).max(10).optional(),
  })
  .strict();
