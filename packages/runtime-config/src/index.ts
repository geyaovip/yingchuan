import { readFileSync } from "node:fs";

export interface RuntimeValueOptions {
  readonly fallback?: string;
  readonly requiredInProduction?: boolean;
}

export function getRuntimeValue(
  name: string,
  options: RuntimeValueOptions = {},
): string {
  const fileName = process.env[`${name}_FILE`];
  const directValue = process.env[name];
  if (fileName && directValue) {
    throw new Error(`${name} and ${name}_FILE cannot both be set.`);
  }

  const value = fileName ? readFileSync(fileName, "utf8").trim() : directValue;
  if (value) return value;
  if (options.fallback && process.env.NODE_ENV !== "production") {
    return options.fallback;
  }
  if (options.requiredInProduction || process.env.NODE_ENV === "production") {
    throw new Error(`${name} is required.`);
  }
  return "";
}
