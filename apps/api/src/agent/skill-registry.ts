import { z } from "zod";

export interface SkillDefinition {
  readonly audit: "full";
  readonly description: string;
  readonly idempotency: "none" | "required";
  readonly inputSchema: z.ZodType;
  readonly maxImpact: Readonly<Record<string, number>>;
  readonly name: string;
  readonly permissions: readonly string[];
  readonly risk: "low" | "read";
  readonly timeoutMs: number;
  readonly version: number;
  readonly write: boolean;
}

const id = z.string().uuid();
export const skillRegistry = new Map<string, SkillDefinition>([
  skill("dashboard.read", "读取平台管理摘要", z.object({}), false),
  skill(
    "task.health.read",
    "读取一个任务及子任务健康",
    z.object({ jobId: id }),
    false,
  ),
  skill("model.health.read", "读取模型调用与配置健康", z.object({}), false),
  skill("queue.health.read", "读取队列与死信健康", z.object({}), false),
  skill(
    "project.report.read",
    "读取项目最新报告",
    z.object({ projectId: id }),
    false,
  ),
  skill("retry_task", "重试一个允许重试的任务", z.object({ jobId: id }), true, {
    jobs: 1,
  }),
  skill(
    "admin.todo.create",
    "创建一条管理待办",
    z.object({
      description: z.string().max(1000).optional(),
      title: z.string().trim().min(1).max(200),
    }),
    true,
    { todos: 1 },
  ),
]);

export const brandAssistantSkillRegistry = new Map<string, SkillDefinition>([
  brandReadSkill("brand.project.read", "读取当前品牌项目基础信息"),
  brandReadSkill("brand.report.read", "读取当前品牌项目最新报告"),
  brandReadSkill("brand.competitors.read", "读取当前品牌项目竞品"),
  brandReadSkill("brand.prompts.read", "读取当前品牌项目启用的分析问题"),
]);

export function validateRegistry(): void {
  for (const definition of [
    ...skillRegistry.values(),
    ...brandAssistantSkillRegistry.values(),
  ]) {
    if (
      !definition.name ||
      definition.version < 1 ||
      definition.timeoutMs < 1 ||
      definition.audit !== "full"
    )
      throw new Error("SKILL_DEFINITION_INVALID");
    if (!definition.write && definition.idempotency === "required")
      throw new Error("SKILL_IDEMPOTENCY_INVALID");
  }
}

function brandReadSkill(name: string, description: string) {
  return skill(name, description, z.object({ projectId: id }), false, {}, [
    "project.read",
  ]);
}

function skill(
  name: string,
  description: string,
  inputSchema: z.ZodType,
  write: boolean,
  maxImpact: Readonly<Record<string, number>> = {},
  permissions: readonly string[] = ["platform.super_admin"],
): [string, SkillDefinition] {
  return [
    name,
    {
      audit: "full",
      description,
      idempotency: write ? "required" : "none",
      inputSchema,
      maxImpact,
      name,
      permissions,
      risk: write ? "low" : "read",
      timeoutMs: 10_000,
      version: 1,
      write,
    },
  ];
}
