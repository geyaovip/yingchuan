import { z } from "zod";

const ids = z
  .array(z.uuid())
  .min(1)
  .max(200)
  .refine((values) => new Set(values).size === values.length);
export const micros = z
  .string()
  .regex(/^\d{1,12}$/)
  .refine((value) => BigInt(value) > 0n && BigInt(value) <= 10_000_000_000n);
export const selectionSchema = z.union([
  z.object({ promptIds: ids, modelConfigIds: ids.max(20) }).strict(),
  z.object({ sourceJobId: z.uuid() }).strict(),
]);
export const scheduleSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    frequency: z.enum(["daily", "weekly"]),
    hour: z.number().int().min(0).max(23),
    minute: z.number().int().min(0).max(59),
    weekday: z.number().int().min(0).max(6),
    promptIds: ids,
    modelConfigIds: ids.max(20),
    maxCostMicros: micros,
  })
  .strict();
export const scheduleUpdateSchema = scheduleSchema.extend({
  version: z.number().int().positive(),
});
export const activeSchema = z
  .object({ active: z.boolean(), version: z.number().int().positive() })
  .strict();
const evidenceUrl = z
  .url()
  .max(2000)
  .refine((value) => {
    const url = new URL(value);
    return (
      ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
    );
  })
  .nullable()
  .optional();
const taskFields = {
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(2000),
  assigneeId: z.uuid().nullable().optional(),
  evidenceUrl,
  dueAt: z.iso.datetime({ offset: true }).nullable().optional(),
};
export const taskSchema = z
  .object({ ...taskFields, baselineJobId: z.uuid() })
  .strict();
export const taskUpdateSchema = z
  .object({
    ...taskFields,
    version: z.number().int().positive(),
    status: z.enum(["open", "in_progress", "done"]),
  })
  .strict();
export const retestSchema = z.object({ maxCostMicros: micros }).strict();
export const filtersSchema = z
  .object({
    days: z.coerce
      .number()
      .pipe(z.union([z.literal(7), z.literal(30), z.literal(90)]))
      .default(30),
    modelId: z.uuid().optional(),
    promptId: z.uuid().optional(),
    group: z.string().min(1).max(100).optional(),
  })
  .strict();
