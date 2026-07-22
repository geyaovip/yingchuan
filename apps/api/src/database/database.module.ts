import {
  Global,
  Inject,
  Injectable,
  Module,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { createDatabaseClient, type PrismaClient } from "@yingchuan/database";
import { getRuntimeValue } from "@yingchuan/runtime-config";

import { DATABASE_CLIENT } from "./database.constants.js";

function createRuntimeDatabase(): PrismaClient {
  return createDatabaseClient(
    getRuntimeValue("DATABASE_URL", {
      fallback:
        "postgresql://yingchuan:yingchuan_local_only@127.0.0.1:55432/yingchuan?schema=public",
    }),
  );
}

@Injectable()
class DatabaseLifecycle implements OnApplicationShutdown {
  constructor(
    @Inject(DATABASE_CLIENT) private readonly database: PrismaClient,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    await this.database.$disconnect();
  }
}

@Global()
@Module({
  exports: [DATABASE_CLIENT],
  providers: [
    { provide: DATABASE_CLIENT, useFactory: createRuntimeDatabase },
    DatabaseLifecycle,
  ],
})
export class DatabaseModule {}
