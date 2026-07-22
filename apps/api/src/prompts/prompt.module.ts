import { Module } from "@nestjs/common";
import type { PrismaClient } from "@yingchuan/database";
import { PromptApplicationService } from "@yingchuan/prompts";

import { AuthModule } from "../auth/auth.module.js";
import { DATABASE_CLIENT } from "../database/database.constants.js";
import { DatabaseModule } from "../database/database.module.js";
import { PROMPT_SERVICE } from "./prompt.constants.js";
import { PromptController } from "./prompt.controller.js";

@Module({
  controllers: [PromptController],
  imports: [DatabaseModule, AuthModule],
  providers: [
    {
      inject: [DATABASE_CLIENT],
      provide: PROMPT_SERVICE,
      useFactory: (database: PrismaClient) =>
        new PromptApplicationService(database),
    },
  ],
})
export class PromptModule {}
