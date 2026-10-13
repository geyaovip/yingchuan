import { NotificationApplicationService } from "@yingchuan/notifications";
import { Module } from "@nestjs/common";
import {
  AnalysisApplicationService,
  InsightsApplicationService,
  MonitoringApplicationService,
} from "@yingchuan/analysis";
import type { PrismaClient } from "@yingchuan/database";
import type { ModelGatewayApplicationService } from "@yingchuan/model-gateway";
import { AnalysisModule } from "../analysis/analysis.module.js";
import { ANALYSIS_SERVICE } from "../analysis/analysis.constants.js";
import { AuthModule } from "../auth/auth.module.js";
import { DATABASE_CLIENT } from "../database/database.constants.js";
import { ModelModule } from "../models/model.module.js";
import { MODEL_GATEWAY_SERVICE } from "../models/model.constants.js";
import { MonitoringController } from "./monitoring.controller.js";
@Module({
  imports: [AuthModule, AnalysisModule, ModelModule],
  controllers: [MonitoringController],
  providers: [
    {
      provide: InsightsApplicationService,
      inject: [DATABASE_CLIENT],
      useFactory: (database: PrismaClient) =>
        new InsightsApplicationService(database),
    },
    {
      provide: MonitoringApplicationService,
      inject: [DATABASE_CLIENT, MODEL_GATEWAY_SERVICE, ANALYSIS_SERVICE],
      useFactory: (
        database: PrismaClient,
        gateway: ModelGatewayApplicationService,
        analysis: AnalysisApplicationService,
      ) =>
        new MonitoringApplicationService(
          database,
          gateway,
          analysis,
          (tx, input) =>
            NotificationApplicationService.createSiteNotice(tx, input),
        ),
    },
  ],
})
export class MonitoringModule {}
