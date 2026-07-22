import { Injectable } from "@nestjs/common";
import { getRuntimeValue } from "@yingchuan/runtime-config";
import { Resend } from "resend";

export interface SendCodeInput {
  readonly code: string;
  readonly email: string;
  readonly idempotencyKey: string;
  readonly purpose: "login" | "step_up";
}

export interface EmailSender {
  sendCode(input: SendCodeInput): Promise<string>;
  sendWorkspaceInvitation(input: {
    email: string;
    idempotencyKey: string;
    token: string;
    workspaceName: string;
  }): Promise<string>;
}

@Injectable()
export class ResendEmailSender implements EmailSender {
  async sendCode(input: SendCodeInput): Promise<string> {
    const client = new Resend(
      getRuntimeValue("RESEND_API_KEY", { requiredInProduction: true }),
    );
    const purpose = input.purpose === "step_up" ? "敏感操作验证" : "登录";
    const response = await client.emails.send(
      {
        from: "映川 <login@mail.chatway.chat>",
        subject: `映川${purpose}验证码`,
        text: `你的验证码是 ${input.code}，10 分钟内有效。请勿转发给任何人。`,
        to: [input.email],
      },
      { idempotencyKey: input.idempotencyKey },
    );
    if (response.error || !response.data?.id) {
      throw new Error("EMAIL_DELIVERY_FAILED");
    }
    return response.data.id;
  }

  async sendWorkspaceInvitation(input: {
    email: string;
    idempotencyKey: string;
    token: string;
    workspaceName: string;
  }): Promise<string> {
    const client = new Resend(
      getRuntimeValue("RESEND_API_KEY", { requiredInProduction: true }),
    );
    const response = await client.emails.send(
      {
        from: "映川 <login@mail.chatway.chat>",
        subject: `加入映川工作区：${input.workspaceName}`,
        text: `你受邀加入“${input.workspaceName}”。登录映川后使用以下邀请令牌接受邀请：${input.token}`,
        to: [input.email],
      },
      { idempotencyKey: input.idempotencyKey },
    );
    if (response.error || !response.data?.id) {
      throw new Error("EMAIL_DELIVERY_FAILED");
    }
    return response.data.id;
  }
}
