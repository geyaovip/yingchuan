import { MonitoringModule } from "./monitoring/monitoring.module.js";
import { Module } from "@nestjs/common";

import { AuditModule } from "./audit/audit.module.js";
import { AppController } from "./app.controller.js";
import { AppService } from "./app.service.js";
import { ReadinessService } from "./readiness.service.js";
import { AuthModule } from "./auth/auth.module.js";
import { DatabaseModule } from "./database/database.module.js";
import { WorkspaceModule } from "./workspaces/workspace.module.js";
import { ProjectModule } from "./projects/project.module.js";
import { PromptModule } from "./prompts/prompt.module.js";
import { ModelModule } from "./models/model.module.js";
import { AnalysisModule } from "./analysis/analysis.module.js";
import { ScoringModule } from "./scoring/scoring.module.js";
import { ReportModule } from "./reports/report.module.js";
import { AdminModule } from "./admin/admin.module.js";
import { AgentModule } from "./agent/agent.module.js";
import { NotificationModule } from "./notifications/notification.module.js";
import { LifecycleModule } from "./lifecycle/lifecycle.module.js";

@Module({
  imports: [
    MonitoringModule,
    DatabaseModule,
    AuthModule,
    WorkspaceModule,
    ProjectModule,
    PromptModule,
    ModelModule,
    AnalysisModule,
    ScoringModule,
    ReportModule,
    AdminModule,
    AgentModule,
    NotificationModule,
    LifecycleModule,
    AuditModule,
  ],
  controllers: [AppController],
  providers: [AppService, ReadinessService],
})
export class AppModule {}
