import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { WorkspaceController } from "./workspace.controller.js";
import { WorkspaceService } from "./workspace.service.js";

@Module({
  controllers: [WorkspaceController],
  imports: [AuthModule],
  providers: [WorkspaceService],
})
export class WorkspaceModule {}
