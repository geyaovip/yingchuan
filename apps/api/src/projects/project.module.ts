import { Module } from "@nestjs/common";
import type { PrismaClient } from "@yingchuan/database";
import { ProjectApplicationService } from "@yingchuan/projects";

import { AuthModule } from "../auth/auth.module.js";
import { DATABASE_CLIENT } from "../database/database.constants.js";
import { DatabaseModule } from "../database/database.module.js";
import { PROJECT_SERVICE } from "./project.constants.js";
import { ProjectController } from "./project.controller.js";

@Module({
  controllers: [ProjectController],
  imports: [DatabaseModule, AuthModule],
  providers: [
    {
      inject: [DATABASE_CLIENT],
      provide: PROJECT_SERVICE,
      useFactory: (database: PrismaClient) =>
        new ProjectApplicationService(database),
    },
  ],
})
export class ProjectModule {}
