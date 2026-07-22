export interface TelegramAdapter {
  send(input: {
    chatId: string;
    text: string;
    token: string;
  }): Promise<{ messageId: string }>;
}

export class TelegramHttpAdapter implements TelegramAdapter {
  async send(input: { chatId: string; text: string; token: string }) {
    const response = await fetch(
      `https://api.telegram.org/bot${encodeURIComponent(input.token)}/sendMessage`,
      {
        body: JSON.stringify({
          chat_id: input.chatId,
          disable_web_page_preview: true,
          text: input.text,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!response.ok)
      throw new Error(
        response.status === 401
          ? "TELEGRAM_AUTH_FAILED"
          : "TELEGRAM_DELIVERY_FAILED",
      );
    const body = (await response.json()) as {
      result?: { message_id?: unknown };
    };
    if (typeof body.result?.message_id !== "number")
      throw new Error("TELEGRAM_RESPONSE_INVALID");
    return { messageId: String(body.result.message_id) };
  }
}
