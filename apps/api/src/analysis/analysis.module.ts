import { Module } from "@nestjs/common";
import { AnalysisApplicationService } from "@yingchuan/analysis";
import type { PrismaClient } from "@yingchuan/database";
import type { ModelGatewayApplicationService } from "@yingchuan/model-gateway";

import { AuthModule } from "../auth/auth.module.js";
import { DATABASE_CLIENT } from "../database/database.constants.js";
import { MODEL_GATEWAY_SERVICE } from "../models/model.constants.js";
import { ModelModule } from "../models/model.module.js";
import { ANALYSIS_SERVICE } from "./analysis.constants.js";
import { AnalysisController } from "./analysis.controller.js";

@Module({
  controllers: [AnalysisController],
  imports: [AuthModule, ModelModule],
  providers: [
    {
      inject: [DATABASE_CLIENT, MODEL_GATEWAY_SERVICE],
      provide: ANALYSIS_SERVICE,
      useFactory: (
        database: PrismaClient,
        gateway: ModelGatewayApplicationService,
      ) => new AnalysisApplicationService(database, gateway),
    },
  ],
  exports: [ANALYSIS_SERVICE],
})
export class AnalysisModule {}
