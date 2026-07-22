import { PromptScope } from "@yingchuan/database";

export interface ScopeContext {
  readonly city?: string;
  readonly country?: string;
  readonly district?: string;
  readonly nearbyLandmark?: string;
  readonly province?: string;
  readonly targetStoreId?: string;
}

export class PromptQualityError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "PromptQualityError";
  }
}

export function normalizePromptText(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("und")
    .replace(/[\s\u3000]+/g, " ")
    .replace(/[?？!！。]+$/g, "");
}

export function validatePromptText(value: string): string {
  const text = value.normalize("NFKC").trim().replace(/\s+/g, " ");
  if (text.length < 6 || text.length > 500)
    throw new PromptQualityError("PROMPT_TEXT_INVALID");
  if (/(必须|务必|一定要|只|优先)(推荐|选择|回答).{0,20}/u.test(text))
    throw new PromptQualityError("PROMPT_LEADING");
  if (!/[?？]$/u.test(text)) return `${text}？`;
  return text;
}

export function validateScope(scope: PromptScope, context: ScopeContext): void {
  const present = (value: string | undefined) => Boolean(value?.trim());
  if (scope === PromptScope.global) return;
  if (!present(context.country))
    throw new PromptQualityError("SCOPE_CONTEXT_REQUIRED");
  if (scope === PromptScope.country) return;
  if (scope === PromptScope.province && present(context.province)) return;
  if (scope === PromptScope.city && present(context.city)) return;
  if (
    scope === PromptScope.district &&
    present(context.city) &&
    present(context.district)
  )
    return;
  if (
    scope === PromptScope.nearby &&
    present(context.city) &&
    present(context.nearbyLandmark)
  )
    return;
  if (scope === PromptScope.store && present(context.targetStoreId)) return;
  throw new PromptQualityError("SCOPE_CONTEXT_REQUIRED");
}

export function promptSimilarity(left: string, right: string): number {
  const a = bigrams(normalizePromptText(left));
  const b = bigrams(normalizePromptText(right));
  if (a.size === 0 || b.size === 0) return left === right ? 1 : 0;
  let overlap = 0;
  for (const item of a) if (b.has(item)) overlap += 1;
  return overlap / (a.size + b.size - overlap);
}

function bigrams(value: string): Set<string> {
  const compact = value.replace(/\s+/g, "");
  const result = new Set<string>();
  for (let index = 0; index < compact.length - 1; index += 1)
    result.add(compact.slice(index, index + 2));
  return result;
}
