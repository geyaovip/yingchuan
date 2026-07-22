import { Module } from "@nestjs/common";
import type { PrismaClient } from "@yingchuan/database";
import { AuthModule } from "../auth/auth.module.js";
import { DATABASE_CLIENT } from "../database/database.constants.js";
import { AdminController } from "./admin.controller.js";
import { AdminService } from "./admin.service.js";

@Module({
  controllers: [AdminController],
  imports: [AuthModule],
  providers: [
    {
      inject: [DATABASE_CLIENT],
      provide: AdminService,
      useFactory: (database: PrismaClient) => new AdminService(database),
    },
  ],
})
export class AdminModule {}
