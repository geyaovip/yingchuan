import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { AuditController } from "./audit.controller.js";
import { AuditService } from "./audit.service.js";

@Module({
  controllers: [AuditController],
  imports: [AuthModule],
  providers: [AuditService],
})
export class AuditModule {}
