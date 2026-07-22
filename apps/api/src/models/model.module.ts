import { Module } from "@nestjs/common";
import type { PrismaClient } from "@yingchuan/database";
import {
  ModelGatewayApplicationService,
  SecretBox,
  VolcengineArkAdapter,
} from "@yingchuan/model-gateway";
import { getRuntimeValue } from "@yingchuan/runtime-config";

import { AuthModule } from "../auth/auth.module.js";
import { DATABASE_CLIENT } from "../database/database.constants.js";
import { MODEL_GATEWAY_SERVICE } from "./model.constants.js";
import { ModelController } from "./model.controller.js";
import { InternalModelController } from "./internal-model.controller.js";

@Module({
  controllers: [ModelController, InternalModelController],
  imports: [AuthModule],
  providers: [
    {
      inject: [DATABASE_CLIENT],
      provide: MODEL_GATEWAY_SERVICE,
      useFactory: (database: PrismaClient) =>
        new ModelGatewayApplicationService(
          database,
          new SecretBox(
            getRuntimeValue("MODEL_CREDENTIAL_MASTER_KEY", {
              fallback: "yingchuan_local_model_key_change_before_production_32",
            }),
            getRuntimeValue("MODEL_CREDENTIAL_KEY_VERSION", {
              fallback: "local-v1",
            }),
          ),
          new VolcengineArkAdapter(),
        ),
    },
  ],
  exports: [MODEL_GATEWAY_SERVICE],
})
export class ModelModule {}
