import { z } from "zod";

export const createWorkspaceSchema = z.object({
  name: z.string().trim().min(1).max(100),
});

export const updateWorkspaceSchema = z.object({
  name: z.string().trim().min(1).max(100),
  version: z.number().int().positive(),
});

export const inviteMemberSchema = z.object({
  email: z.string().trim().email().max(320),
  roleCode: z.enum(["admin", "analyst", "operator", "viewer"]),
});

export const acceptInvitationSchema = z.object({
  token: z.string().min(32).max(256),
});

export const updateMemberSchema = z.object({
  roleCode: z.enum(["owner", "admin", "analyst", "operator", "viewer"]),
  version: z.number().int().positive(),
});
