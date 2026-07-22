import { ApiClient } from "@yingchuan/api-client";

const environment = import.meta.env as {
  readonly DEV: boolean;
  readonly VITE_API_BASE_URL?: string;
};

export const api = new ApiClient({
  baseUrl:
    environment.VITE_API_BASE_URL ??
    (environment.DEV ? "http://localhost:3000" : "https://api.chatway.chat"),
});
