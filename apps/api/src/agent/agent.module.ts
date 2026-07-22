import { Module } from "@nestjs/common";
import type { AnalysisApplicationService } from "@yingchuan/analysis";
import type { PrismaClient } from "@yingchuan/database";
import { getRuntimeValue } from "@yingchuan/runtime-config";

import { ANALYSIS_SERVICE } from "../analysis/analysis.constants.js";
import { AnalysisModule } from "../analysis/analysis.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { DATABASE_CLIENT } from "../database/database.constants.js";
import { AgentController } from "./agent.controller.js";
import { AgentService } from "./agent.service.js";
import {
  DeterministicAgentRuntime,
  OpenClawHttpRuntime,
  type OpenClawRuntime,
} from "./openclaw-runtime.js";

const OPENCLAW_RUNTIME = Symbol("OPENCLAW_RUNTIME");
@Module({
  controllers: [AgentController],
  imports: [AuthModule, AnalysisModule],
  providers: [
    {
      provide: OPENCLAW_RUNTIME,
      useFactory: (): OpenClawRuntime => {
        const endpoint = getRuntimeValue("OPENCLAW_GATEWAY_URL", {
          fallback: "",
        });
        return endpoint
          ? new OpenClawHttpRuntime(
              endpoint,
              getRuntimeValue("OPENCLAW_GATEWAY_TOKEN", { fallback: "" }),
            )
          : new DeterministicAgentRuntime();
      },
    },
    {
      inject: [DATABASE_CLIENT, ANALYSIS_SERVICE, OPENCLAW_RUNTIME],
      provide: AgentService,
      useFactory: (
        database: PrismaClient,
        analysis: AnalysisApplicationService,
        runtime: OpenClawRuntime,
      ) => new AgentService(database, analysis, runtime),
    },
  ],
})
export class AgentModule {}
