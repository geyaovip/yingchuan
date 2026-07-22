import { Module } from "@nestjs/common";
import { DataLifecycleApplicationService } from "@yingchuan/data-lifecycle";
import type { PrismaClient } from "@yingchuan/database";
import { getRuntimeValue } from "@yingchuan/runtime-config";

import { AuthModule } from "../auth/auth.module.js";
import { DATABASE_CLIENT } from "../database/database.constants.js";
import { DATA_LIFECYCLE_SERVICE } from "./lifecycle.constants.js";
import { LifecycleController } from "./lifecycle.controller.js";

@Module({
  controllers: [LifecycleController],
  imports: [AuthModule],
  providers: [
    {
      inject: [DATABASE_CLIENT],
      provide: DATA_LIFECYCLE_SERVICE,
      useFactory: (database: PrismaClient) =>
        new DataLifecycleApplicationService(
          database,
          getRuntimeValue("PRIVATE_FILE_ROOT", {
            fallback: "../../storage/private",
          }),
        ),
    },
  ],
})
export class LifecycleModule {}
