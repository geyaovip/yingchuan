import { z } from "zod";
import {
  KnowledgeSourceStatus,
  KnowledgeSourceType,
} from "@yingchuan/database";

const uuid = z.uuid();

export const createProjectSchema = z.object({
  defaultCountry: z.string().length(2).optional(),
  defaultLanguage: z.string().min(2).max(20).optional(),
  industryId: uuid.optional(),
  name: z.string().trim().min(1).max(120),
  timezone: z.string().min(1).max(100).optional(),
  websiteUrl: z.url().max(2048).optional(),
  workspaceId: uuid,
});

export const updateProjectSchema = z.object({
  name: z.string().trim().min(1).max(120),
  version: z.number().int().positive(),
});

export const createCandidateSchema = z.object({
  country: z.string().length(2).optional(),
  displayName: z.string().trim().min(1).max(160),
  officialWebsite: z.url().max(2048).optional(),
});

export const confirmIdentificationSchema = z.object({
  aliases: z.array(z.string().trim().min(1).max(160)).max(30).optional(),
  candidateId: uuid,
  canonicalName: z.string().trim().min(1).max(160).optional(),
  country: z.string().length(2).optional(),
  officialWebsite: z.url().max(2048).optional(),
  primaryLanguage: z.string().min(2).max(20).optional(),
});

export const createSourceSchema = z.object({
  type: z.enum(KnowledgeSourceType),
  url: z.url().max(2048),
});

export const updateSourceSchema = z.object({
  status: z.enum(KnowledgeSourceStatus),
  type: z.enum(KnowledgeSourceType),
  version: z.number().int().positive(),
});
