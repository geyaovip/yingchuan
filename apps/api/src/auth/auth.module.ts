import { Module } from "@nestjs/common";

import { AuthController } from "./auth.controller.js";
import { EMAIL_SENDER } from "./auth.constants.js";
import { AuthRateLimiter } from "./auth-rate-limiter.js";
import { AuthService } from "./auth.service.js";
import { ResendEmailSender } from "./email-sender.js";

@Module({
  controllers: [AuthController],
  exports: [AuthService, EMAIL_SENDER],
  providers: [
    AuthRateLimiter,
    AuthService,
    ResendEmailSender,
    { provide: EMAIL_SENDER, useExisting: ResendEmailSender },
  ],
})
export class AuthModule {}
