import { Module } from "@nestjs/common";
import type { PrismaClient } from "@yingchuan/database";
import { ReportApplicationService } from "@yingchuan/reports";

import { AuthModule } from "../auth/auth.module.js";
import { DATABASE_CLIENT } from "../database/database.constants.js";
import { ReportController } from "./report.controller.js";
import { REPORT_SERVICE } from "./report.constants.js";

@Module({
  controllers: [ReportController],
  imports: [AuthModule],
  providers: [
    {
      inject: [DATABASE_CLIENT],
      provide: REPORT_SERVICE,
      useFactory: (database: PrismaClient) =>
        new ReportApplicationService(database),
    },
  ],
})
export class ReportModule {}
