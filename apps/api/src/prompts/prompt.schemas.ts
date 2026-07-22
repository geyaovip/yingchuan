import { PromptCategory, PromptScope } from "@yingchuan/database";
import { z } from "zod";

const optionalText = (max: number) =>
  z.string().trim().min(1).max(max).optional();

export const promptInputSchema = z.object({
  category: z.enum(PromptCategory),
  city: optionalText(100),
  country: z.string().trim().length(2).optional(),
  district: optionalText(100),
  enabled: z.boolean().optional(),
  groupKey: optionalText(100),
  language: optionalText(20),
  nearbyLandmark: optionalText(200),
  priority: z.number().int().min(0).max(100).optional(),
  province: optionalText(100),
  requiresWebSearch: z.boolean().optional(),
  scope: z.enum(PromptScope),
  targetStoreId: z.uuid().optional(),
  text: z.string().trim().min(1).max(500),
});

export const updatePromptSchema = promptInputSchema.extend({
  version: z.number().int().positive(),
});

export const importPromptsSchema = z.object({
  prompts: z.array(promptInputSchema).min(1).max(100),
});

export const generatePromptsSchema = z.object({
  city: optionalText(100),
  count: z.number().int().min(1).max(12).optional(),
  country: z.string().trim().length(2).optional(),
  district: optionalText(100),
  groupKey: optionalText(100),
  nearbyLandmark: optionalText(200),
  province: optionalText(100),
  scope: z.enum(PromptScope).optional(),
  targetStoreId: z.uuid().optional(),
});

export const variantsSchema = z.object({
  count: z.number().int().min(1).max(5).default(3),
});
