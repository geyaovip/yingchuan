import { Module } from "@nestjs/common";
import type { PrismaClient } from "@yingchuan/database";
import { SecretBox } from "@yingchuan/model-gateway";
import {
  NotificationApplicationService,
  TelegramHttpAdapter,
} from "@yingchuan/notifications";
import { getRuntimeValue } from "@yingchuan/runtime-config";
import { AuthModule } from "../auth/auth.module.js";
import { DATABASE_CLIENT } from "../database/database.constants.js";
import { NotificationController } from "./notification.controller.js";
import { NOTIFICATION_SERVICE } from "./notification.constants.js";

@Module({
  controllers: [NotificationController],
  imports: [AuthModule],
  providers: [
    {
      inject: [DATABASE_CLIENT],
      provide: NOTIFICATION_SERVICE,
      useFactory: (database: PrismaClient) =>
        new NotificationApplicationService(
          database,
          new SecretBox(
            getRuntimeValue("NOTIFICATION_CREDENTIAL_MASTER_KEY", {
              fallback: "yingchuan_local_notification_key_change_32",
            }),
            getRuntimeValue("NOTIFICATION_CREDENTIAL_KEY_VERSION", {
              fallback: "local-v1",
            }),
          ),
          new TelegramHttpAdapter(),
        ),
    },
  ],
})
export class NotificationModule {}
