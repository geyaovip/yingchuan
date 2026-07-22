import { z } from "zod";

export const audienceSchema = z.enum(["user", "admin"]);
export type AuthAudienceInput = z.infer<typeof audienceSchema>;

const emailSchema = z.string().trim().email().max(320);
const codeSchema = z.string().regex(/^\d{6}$/);

export const requestCodeSchema = z.object({
  audience: audienceSchema,
  email: emailSchema,
});

export const verifyCodeSchema = requestCodeSchema.extend({ code: codeSchema });

export const stepUpVerifySchema = z.object({ code: codeSchema });
