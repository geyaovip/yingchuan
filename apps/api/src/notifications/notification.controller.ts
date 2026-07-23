import {
  Body,
  Controller,
  Get,
  Headers,
  HttpException,
  Inject,
  Param,
  Patch,
  Put,
  Post,
  Req,
} from "@nestjs/common";
import type {
  AlertApplicationService,
  NotificationApplicationService,
  OperationsDailyReportApplicationService,
} from "@yingchuan/notifications";
import type { Request } from "express";
import { z } from "zod";
import { SESSION_COOKIE_NAME } from "../auth/auth.constants.js";
import { AuthService } from "../auth/auth.service.js";
import type { AuthenticatedSession } from "../auth/auth.types.js";
import {
  ALERT_SERVICE,
  DAILY_REPORT_SERVICE,
  NOTIFICATION_SERVICE,
} from "./notification.constants.js";

@Controller()
export class NotificationController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(ALERT_SERVICE)
    private readonly alerts: AlertApplicationService,
    @Inject(DAILY_REPORT_SERVICE)
    private readonly dailyReports: OperationsDailyReportApplicationService,
    @Inject(NOTIFICATION_SERVICE)
    private readonly notifications: NotificationApplicationService,
  ) {}
  @Get("notifications") async list(@Req() request: Request) {
    const auth = await this.auth(request);
    return { data: await this.notifications.list(auth.user.id) };
  }
  @Get("admin/alerts") async alertList(@Req() request: Request) {
    const auth = await this.auth(request);
    return {
      data: await this.perform(() => this.alerts.list(this.actor(auth))),
    };
  }
  @Get("admin/operations-daily-reports") async dailyReportList(
    @Req() request: Request,
  ) {
    const auth = await this.auth(request);
    return {
      data: await this.perform(() => this.dailyReports.list(this.actor(auth))),
    };
  }
  @Patch("admin/alerts/:alertId/acknowledge") async acknowledgeAlert(
    @Param("alertId") alertId: string,
    @Headers("x-csrf-token") csrf: string | undefined,
    @Req() request: Request,
  ) {
    const auth = await this.auth(request);
    this.authService.assertCsrf(auth, csrf, request.header("origin") ?? "");
    return {
      data: await this.perform(() =>
        this.alerts.acknowledge(alertId, this.actor(auth)),
      ),
    };
  }
  @Patch("notifications/:notificationId/read") async read(
    @Param("notificationId") id: string,
    @Headers("x-csrf-token") csrf: string | undefined,
    @Req() request: Request,
  ) {
    const auth = await this.auth(request);
    this.authService.assertCsrf(auth, csrf, request.header("origin") ?? "");
    return {
      data: await this.perform(() =>
        this.notifications.markRead(id, auth.user.id),
      ),
    };
  }
  @Get("admin/notification-channels/telegram") async config(
    @Req() request: Request,
  ) {
    const auth = await this.auth(request);
    return {
      data: await this.perform(() =>
        this.notifications.getAdminConfig(this.actor(auth)),
      ),
    };
  }
  @Put("admin/notification-channels/telegram") async save(
    @Body() body: unknown,
    @Headers("x-csrf-token") csrf: string | undefined,
    @Req() request: Request,
  ) {
    const input = z
      .object({
        chatId: z.string().trim().min(8).max(100),
        enabled: z.boolean(),
        token: z.string().trim().min(20).max(300),
      })
      .parse(body);
    const auth = await this.auth(request);
    this.authService.assertCsrf(auth, csrf, request.header("origin") ?? "");
    return {
      data: await this.perform(() =>
        this.notifications.saveTelegram(input, this.actor(auth)),
      ),
    };
  }
  @Post("admin/notification-channels/telegram/test") async test(
    @Headers("idempotency-key") key: string | undefined,
    @Headers("x-csrf-token") csrf: string | undefined,
    @Req() request: Request,
  ) {
    const auth = await this.auth(request);
    this.authService.assertCsrf(auth, csrf, request.header("origin") ?? "");
    return {
      data: await this.perform(() =>
        this.notifications.testTelegram(key ?? "", this.actor(auth)),
      ),
    };
  }
  @Get("admin/notification-deliveries") async deliveries(
    @Req() request: Request,
  ) {
    const auth = await this.auth(request);
    return {
      data: await this.perform(() =>
        this.notifications.deliveries(this.actor(auth)),
      ),
    };
  }
  private actor(auth: AuthenticatedSession) {
    return {
      audience: auth.session.audience,
      email: auth.user.displayEmail,
      stepUpUntil: auth.session.stepUpUntil,
      userId: auth.user.id,
    };
  }
  private async auth(request: Request) {
    const auth = await this.authService.getSession(this.token(request));
    this.authService.assertSessionOrigin(auth, request.header("origin"));
    return auth;
  }
  private token(request: Request) {
    for (const item of request.header("cookie")?.split(";") ?? []) {
      const [name, ...value] = item.trim().split("=");
      if (name === SESSION_COOKIE_NAME)
        return decodeURIComponent(value.join("="));
    }
    return undefined;
  }
  private async perform<T>(operation: () => Promise<T>) {
    try {
      return await operation();
    } catch (error) {
      const raw =
        error instanceof Error ? error.message : "NOTIFICATION_FAILED";
      const code = [
        "FORBIDDEN",
        "AUTH_STEP_UP_REQUIRED",
        "ALERT_NOT_ACTIVE",
        "ALERT_NOT_FOUND",
        "RESOURCE_NOT_FOUND",
        "IDEMPOTENCY_KEY_REQUIRED",
        "RATE_LIMITED",
        "TELEGRAM_NOT_CONFIGURED",
        "TELEGRAM_AUTH_FAILED",
        "TELEGRAM_DELIVERY_FAILED",
        "TELEGRAM_RESPONSE_INVALID",
      ].includes(raw)
        ? raw
        : "NOTIFICATION_FAILED";
      const status =
        code === "FORBIDDEN"
          ? 403
          : code === "RESOURCE_NOT_FOUND" || code === "ALERT_NOT_FOUND"
            ? 404
            : code === "RATE_LIMITED"
              ? 429
              : code === "AUTH_STEP_UP_REQUIRED"
                ? 403
                : code.startsWith("TELEGRAM_")
                  ? 502
                  : 400;
      throw new HttpException(
        { error: { code, message: "无法完成通知操作。" } },
        status,
      );
    }
  }
}
