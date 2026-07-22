import { Module } from "@nestjs/common";
import type { PrismaClient } from "@yingchuan/database";
import { ScoringApplicationService } from "@yingchuan/scoring";

import { AuthModule } from "../auth/auth.module.js";
import { DATABASE_CLIENT } from "../database/database.constants.js";
import { ScoringController } from "./scoring.controller.js";
import { SCORING_SERVICE } from "./scoring.constants.js";

@Module({
  controllers: [ScoringController],
  imports: [AuthModule],
  providers: [
    {
      inject: [DATABASE_CLIENT],
      provide: SCORING_SERVICE,
      useFactory: (database: PrismaClient) =>
        new ScoringApplicationService(database),
    },
  ],
})
export class ScoringModule {}
