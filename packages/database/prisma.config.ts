import { resolve } from "node:path";

import { config } from "dotenv";
import { defineConfig } from "prisma/config";

config({ path: resolve(import.meta.dirname, "../../.env"), quiet: true });

const localDatabaseUrl =
  "postgresql://yingchuan:yingchuan_local_only@127.0.0.1:55432/yingchuan?schema=public";

if (process.env.NODE_ENV === "production" && !process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required in production.");
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? localDatabaseUrl,
  },
});
