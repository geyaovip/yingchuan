import { z } from "zod";

export const cancellationSchema = z.object({
  reason: z.string().trim().min(1).max(500).optional(),
});
