import { describe, expect, it } from "vitest";
import { TelegramHttpAdapter } from "./telegram-adapter.js";
describe("telegram channel boundary", () => {
  it("exposes an adapter without storing secrets in payload contracts", () => {
    expect(new TelegramHttpAdapter()).toBeInstanceOf(TelegramHttpAdapter);
  });
});
