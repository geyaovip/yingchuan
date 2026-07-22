import { ApiMode, ConfigStatus } from "@yingchuan/database";
import { z } from "zod";

export const providerStatusSchema = z.object({ status: z.enum(ConfigStatus) });

export const credentialSchema = z.object({
  credential: z.string().trim().min(8).max(500),
});

const optionalMicros = z
  .union([z.string().regex(/^\d+$/), z.number().int().nonnegative()])
  .optional()
  .transform((value) => (value === undefined ? undefined : BigInt(value)));

export const modelConfigSchema = z
  .object({
    apiMode: z.enum(ApiMode),
    capabilities: z.record(z.string(), z.unknown()).optional(),
    contextWindow: z.number().int().positive().optional(),
    displayName: z.string().trim().min(1).max(100),
    endpointId: z.string().trim().min(1).max(150).optional(),
    inputPriceMicrosPerMillion: optionalMicros,
    isFallback: z.boolean().optional(),
    maxConcurrency: z.number().int().min(1).max(100).optional(),
    modelCode: z.string().trim().min(1).max(150),
    nativeWebSearch: z.boolean().optional(),
    outputPriceMicrosPerMillion: optionalMicros,
    status: z.enum(ConfigStatus),
    timeoutMs: z.number().int().min(1_000).max(300_000).optional(),
    webSearchConfig: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((value, context) => {
    if (value.nativeWebSearch && !value.webSearchConfig)
      context.addIssue({
        code: "custom",
        message: "webSearchConfig is required",
        path: ["webSearchConfig"],
      });
  });
